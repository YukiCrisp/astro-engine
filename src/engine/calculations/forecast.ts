import { calcSinglePlanet } from '../sweph-adapter.js';
import { fromJulianDay, parseDateString, toJulianDay } from '../../utils/date.js';
import { SCHEMA_VERSION } from '../types.js';
import type {
  ForecastAspectType, ForecastData, ForecastMethod, ForecastRow, ForecastTarget,
  NatalChartData, PlanetId, ZodiacSystem,
} from '../types.js';
import { signedAspectOrb, shiftedAnglesFor } from './transit-events.js';
import { progressedJdFromRealJd, type ProgressionClock } from './progressions.js';

const ASPECT_ANGLES: Record<ForecastAspectType, number> = {
  CONJUNCTION: 0, OPPOSITION: 180, TRINE: 120, SQUARE: 90, SEXTILE: 60,
};

/**
 * Two in-orb stretches of the same mover / target / shifted angle are one row
 * only when the mover turned around between them (a station), the orb never
 * opened past this many degrees, and the gap is no longer than the method's
 * `maxGap`. A retrograde loop swings at most ~20° (Mars),
 * so its passes join; Jupiter coming back to the same angle twelve years later
 * has gone all the way round and stays a separate row.
 */
export const MERGE_MAX_ORB_DEG = 30;

/** Two adjacent samples straddle the ±180° jump of the signed orb rather than an exact when their orbs add up past this. */
const WRAP_GUARD_DEG = 90;

interface MethodSpec {
  /** Sampling step in real days. */
  step: number;
  /** Search margin on each side of the window, before any widening (days). */
  initialPad: number;
  /** Widest margin on each side (days). A row still cut there gets openStart / openEnd. */
  maxPad: number;
  /** Bisection stops when the bracket is narrower than this (days). */
  exactTolerance: number;
  /**
   * Longest time out of the orb that a retrograde loop can still join (days).
   * A transiting planet turns retrograde about once a year, so a longer gap
   * is a new cycle. Progressed Mercury–Mars turn only a few times in a life;
   * a return after more than five years reads as a new event.
   */
  maxGap: number;
}

const SPECS: Record<ForecastMethod, MethodSpec> = {
  // Daily noon samples. Pluto and Neptune stay inside a 3° orb for 3–5 years,
  // so the margin widens up to ten years before a row is called cut.
  transit: { step: 1, initialPad: 400, maxPad: 3653, exactTolerance: 10 / 1440, maxGap: 450 },
  // Weekly samples: the progressed Moon moves about 0.25° a week. A progressed
  // Venus or Mars near its station can hold one aspect for over a decade.
  progressed: { step: 7, initialPad: 730, maxPad: 10958, exactTolerance: 1, maxGap: 1826 },
};

export interface ForecastComputationParams {
  natal: NatalChartData;
  method: ForecastMethod;
  /** Required for `progressed`: maps real moments onto the progressed sky. */
  clock?: ProgressionClock;
  startDate: string;
  endDate: string;
  movers: PlanetId[];
  targets: ForecastTarget[];
  aspects: ForecastAspectType[];
  orb: number;
  zodiacSystem?: ZodiacSystem;
}

interface Sample { t: number; lon: number; speed: number }

/** Inclusive sample-index range of one in-orb stretch. */
interface Stretch { a: number; b: number }

type PositionAt = (id: PlanetId, realJd: number) => { lon: number; speed: number };

function dateMidnightJd(date: string): number {
  const { year, month, day } = parseDateString(date);
  return toJulianDay(year, month, day, 0);
}

/**
 * Where the linear orb between two samples meets ±limit, as fractions of the
 * step in [0, 1], sorted. Used for the entry (first) and exit (last) moments.
 */
function limitCrossings(o0: number, o1: number, limit: number): number[] {
  if (o1 === o0) return [];
  return [limit, -limit]
    .map((l) => (l - o0) / (o1 - o0))
    .filter((f) => f >= 0 && f <= 1)
    .sort((x, y) => x - y);
}

export function computeForecast(params: ForecastComputationParams): ForecastData {
  const { natal, method, orb } = params;
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';
  const spec = SPECS[method];
  if (method === 'progressed' && !params.clock) throw new Error('progressed forecast needs a progression clock');

  const positionAt: PositionAt = (id, realJd) => {
    const jd = method === 'transit' ? realJd : progressedJdFromRealJd(params.clock!, realJd);
    const p = calcSinglePlanet(jd, id, zodiac);
    return { lon: p.longitude, speed: p.speed };
  };

  // The window runs from midnight UT of the start date to midnight after the
  // end date. Transit samples sit at noon UT, as in the transit calendar.
  const windowStart = dateMidnightJd(params.startDate);
  const windowEnd = dateMidnightJd(params.endDate) + 1;
  const anchor = method === 'transit' ? windowStart + 0.5 : windowStart;

  const birthTimeKnown = !natal.meta.birthTimeAssumed;
  const targets: { id: ForecastTarget; lon: number }[] = [];
  for (const id of params.targets) {
    if (id === 'ASC' || id === 'MC') {
      // Angles from an assumed noon are not a time to forecast against.
      if (birthTimeKnown && natal.angles) targets.push({ id, lon: id === 'ASC' ? natal.angles.asc : natal.angles.mc });
      continue;
    }
    const planet = natal.planets.find((p) => p.id === id);
    if (planet) targets.push({ id, lon: planet.longitude });
  }

  const rows: ForecastRow[] = [];
  for (const mover of params.movers) {
    let pad = spec.initialPad;
    for (;;) {
      const result = moverRows(mover, pad);
      if (!result.unsettled || pad >= spec.maxPad) {
        rows.push(...result.rows);
        break;
      }
      pad = Math.min(pad * 2, spec.maxPad);
    }
  }

  rows.sort((x, y) =>
    x.segments[0].enter.localeCompare(y.segments[0].enter) ||
    params.movers.indexOf(x.mover) - params.movers.indexOf(y.mover));

  return {
    window: { startDate: params.startDate, endDate: params.endDate },
    method,
    rows,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      calculatedAt: new Date().toISOString(),
      birthTimeAssumed: natal.meta.birthTimeAssumed,
    },
  };

  /**
   * One mover's rows with a search margin of `pad` days each side. `unsettled`
   * says a row touching the window may still reach (or join a stretch) beyond
   * the margin, so the caller widens it.
   */
  function moverRows(mover: PlanetId, pad: number): { rows: ForecastRow[]; unsettled: boolean } {
    const kFirst = -Math.ceil(pad / spec.step);
    const kLast = Math.ceil((windowEnd - anchor + pad) / spec.step);
    const samples: Sample[] = [];
    for (let k = kFirst; k <= kLast; k++) {
      const t = anchor + k * spec.step;
      samples.push({ t, ...positionAt(mover, t) });
    }
    const n = samples.length;
    const out: ForecastRow[] = [];
    let unsettled = false;

    for (const target of targets) {
      for (const aspect of params.aspects) {
        for (const shifted of shiftedAnglesFor(ASPECT_ANGLES[aspect])) {
          const orbs = samples.map((s) => signedAspectOrb(s.lon, target.lon, shifted));
          const orbAt = (t: number) => signedAspectOrb(positionAt(mover, t).lon, target.lon, shifted);

          for (const group of groupStretches(findStretches(orbs), orbs)) {
            // A row belongs to the window when one of its in-orb stretches
            // overlaps it, not merely the span from its first to last stretch.
            if (!group.some((s) => stretchEnter(s, orbs) < windowEnd && stretchLeave(s, orbs) > windowStart)) continue;

            const first = group[0];
            const last = group[group.length - 1];
            const openStart = first.a === 0;
            const openEnd = last.b === n - 1;
            if (openStart || openEnd || !settledBefore(first, orbs) || !settledAfter(last, orbs)) unsettled = true;

            out.push(buildRow(mover, target.id, aspect, shifted, group, orbs, orbAt, openStart, openEnd));
          }
        }
      }
    }
    return { rows: out, unsettled };

    function findStretches(orbs: number[]): Stretch[] {
      const stretches: Stretch[] = [];
      let i = 0;
      while (i < n) {
        if (Math.abs(orbs[i]) <= orb) {
          let b = i;
          while (b + 1 < n && Math.abs(orbs[b + 1]) <= orb) b++;
          stretches.push({ a: i, b });
          i = b + 1;
          continue;
        }
        // A fast mover with a small orb can pass through between two samples
        // without either landing inside: the sign flip still marks it.
        if (i + 1 < n && Math.abs(orbs[i + 1]) > orb && orbs[i] * orbs[i + 1] < 0 &&
            Math.abs(orbs[i]) + Math.abs(orbs[i + 1]) < WRAP_GUARD_DEG) {
          stretches.push({ a: i, b: i + 1 });
        }
        i++;
      }
      return stretches;
    }

    function groupStretches(stretches: Stretch[], orbs: number[]): Stretch[][] {
      const groups: Stretch[][] = [];
      for (const s of stretches) {
        const prev = groups[groups.length - 1]?.at(-1);
        if (prev && joins(prev, s, orbs)) groups[groups.length - 1].push(s);
        else groups.push([s]);
      }
      return groups;
    }

    function joins(prev: Stretch, next: Stretch, orbs: number[]): boolean {
      if (samples[next.a].t - samples[prev.b].t > spec.maxGap) return false;
      let station = false;
      for (let j = prev.b; j < next.a; j++) {
        if (j > prev.b && Math.abs(orbs[j]) > MERGE_MAX_ORB_DEG) return false;
        if ((samples[j].speed < 0) !== (samples[j + 1].speed < 0)) station = true;
      }
      return station;
    }

    /**
     * No earlier stretch can join this one: before the margin runs out, the
     * orb opens past the merge bound or the gap grows past `maxGap`.
     */
    function settledBefore(s: Stretch, orbs: number[]): boolean {
      for (let j = s.a - 1; j >= 0; j--) {
        if (Math.abs(orbs[j]) > MERGE_MAX_ORB_DEG || samples[s.a].t - samples[j].t > spec.maxGap) return true;
      }
      return false;
    }

    function settledAfter(s: Stretch, orbs: number[]): boolean {
      for (let j = s.b + 1; j < n; j++) {
        if (Math.abs(orbs[j]) > MERGE_MAX_ORB_DEG || samples[j].t - samples[s.b].t > spec.maxGap) return true;
      }
      return false;
    }

    function stretchEnter(s: Stretch, orbs: number[]): number {
      const inside = Math.abs(orbs[s.a]) <= orb;
      // From outside into the first inside sample, or (a pass between two
      // samples) the first limit crossing of that step.
      const j = inside ? s.a - 1 : s.a;
      if (j < 0) return samples[0].t;
      const f = limitCrossings(orbs[j], orbs[j + 1], orb)[0] ?? (inside ? 1 : 0);
      return samples[j].t + f * spec.step;
    }

    function stretchLeave(s: Stretch, orbs: number[]): number {
      const inside = Math.abs(orbs[s.b]) <= orb;
      const j = inside ? s.b : s.b - 1;
      if (j + 1 >= n) return samples[n - 1].t;
      const fs = limitCrossings(orbs[j], orbs[j + 1], orb);
      const f = fs.length ? fs[fs.length - 1] : (inside ? 0 : 1);
      return samples[j].t + f * spec.step;
    }

    function buildRow(
      moverId: PlanetId, targetId: ForecastTarget, aspect: ForecastAspectType, shifted: number,
      group: Stretch[], orbs: number[], orbAt: (t: number) => number,
      openStart: boolean, openEnd: boolean,
    ): ForecastRow {
      const exacts: ForecastRow['exacts'] = [];
      const from = Math.max(0, group[0].a - 1);
      const to = Math.min(n - 2, group[group.length - 1].b);
      for (let j = from; j <= to; j++) {
        const o0 = orbs[j];
        const o1 = orbs[j + 1];
        if (!(o0 * o1 < 0 || o1 === 0)) continue;
        if (Math.abs(o0) + Math.abs(o1) >= WRAP_GUARD_DEG) continue;
        if (Math.abs(o0) > orb && Math.abs(o1) > orb && !group.some((s) => s.a === j && s.b === j + 1)) continue;
        const at = bisect(orbAt, samples[j].t, samples[j + 1].t, o0);
        exacts.push({ at: fromJulianDay(at), retrograde: positionAt(moverId, at).speed < 0 });
      }

      let closest: ForecastRow['closest'];
      if (exacts.length > 0) {
        closest = { at: exacts[0].at, orb: 0 };
      } else {
        let best = group[0].a;
        for (const s of group) for (let j = s.a; j <= s.b; j++) if (Math.abs(orbs[j]) < Math.abs(orbs[best])) best = j;
        const lo = samples[Math.max(0, best - 1)].t;
        const hi = samples[Math.min(n - 1, best + 1)].t;
        const t = narrowMinimum((x) => Math.abs(orbAt(x)), lo, hi);
        closest = { at: fromJulianDay(t), orb: Math.round(Math.abs(orbAt(t)) * 100) / 100 };
      }

      return {
        mover: moverId,
        target: targetId,
        aspect,
        angle: shifted,
        segments: group.map((s) => ({
          enter: fromJulianDay(stretchEnter(s, orbs)),
          leave: fromJulianDay(stretchLeave(s, orbs)),
        })),
        openStart,
        openEnd,
        exacts,
        closest,
      };
    }
  }

  /** The zero of `f` between lo and hi (f(lo) has the sign of `fLo`), to the method's tolerance. */
  function bisect(f: (t: number) => number, lo: number, hi: number, fLo: number): number {
    let a = lo;
    let b = hi;
    let fa = fLo;
    while (b - a > spec.exactTolerance) {
      const mid = (a + b) / 2;
      const fm = f(mid);
      if (fm === 0) return mid;
      if (fa * fm < 0) b = mid;
      else { a = mid; fa = fm; }
    }
    return (a + b) / 2;
  }

  /** Golden-section search for the minimum of a unimodal `f` on [lo, hi]. */
  function narrowMinimum(f: (t: number) => number, lo: number, hi: number): number {
    const r = (Math.sqrt(5) - 1) / 2;
    let a = lo;
    let b = hi;
    while (b - a > spec.exactTolerance) {
      const c = b - r * (b - a);
      const d = a + r * (b - a);
      if (f(c) < f(d)) b = d;
      else a = c;
    }
    return (a + b) / 2;
  }
}
