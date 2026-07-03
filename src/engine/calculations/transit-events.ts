import { calcPlanets } from '../sweph-adapter.js';
import { toJulianDay, fromJulianDay, parseDateString } from '../../utils/date.js';
import { SCHEMA_VERSION } from '../types.js';
import type {
  HouseCusp, NatalChartData, PlanetId, PlanetPosition, SignName,
  TransitEvent, TransitEventAspectType, TransitEventsData, ZodiacSystem,
} from '../types.js';

/**
 * Signed orb that crosses zero at the exact aspect for all aspect types.
 * Shared with `calculateEphemeris` (engine/index.ts), which historically
 * defined this privately.
 */
export function signedAspectOrb(longA: number, longB: number, exactAngle: number): number {
  const shiftedB = (longB + exactAngle) % 360;
  let diff = longA - shiftedB;
  diff = ((diff % 360) + 540) % 360 - 180;
  return diff;
}

/** Planets sampled daily and checked for stations (Moon/Sun never station; Moon noise is extreme). */
const STATION_TRANSITERS: readonly PlanetId[] = [
  'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
];

/** Slow movers checked for natal aspects and sign/house ingresses (+ CHIRON when enabled). */
const OUTER_TRANSITERS: readonly PlanetId[] = [
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
];

/** Fast movers whose exact natal aspects only carry signal in short windows. */
const FAST_TRANSITERS: readonly PlanetId[] = ['MERCURY', 'VENUS', 'MARS'];

/**
 * The ten classical points. In long windows the transiting Sun's aspects are
 * restricted to these (plus the angles) — otherwise it hits every asteroid and
 * node twice a year, inflating the calendar far past the meaningful
 * "Sun lights up each of your planets once a year" beats.
 */
const CORE_TARGET_PLANETS: readonly PlanetId[] = [
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
];

const MAJOR_ASPECT_ANGLES: readonly [TransitEventAspectType, number][] = [
  ['CONJUNCTION', 0], ['OPPOSITION', 180], ['TRINE', 120], ['SQUARE', 90], ['SEXTILE', 60],
];

/** In long windows the transiting Sun contributes only its once-a-year exact hits. */
const CONJ_OPP_ANGLES: readonly [TransitEventAspectType, number][] = [
  ['CONJUNCTION', 0], ['OPPOSITION', 180],
];

/**
 * Window-length boundary (inclusive, days) separating the two rule sets.
 * At or below this, fast movers (Sun/Mercury/Venus/Mars) drive the calendar
 * and contribute all major aspects. Above it, they are noise, so aspects come
 * from the slow movers plus the Sun's conjunctions/oppositions only.
 */
const SHORT_WINDOW_MAX_DAYS = 60;

/** Only brackets whose earlier-day |orb| is within this gate count as an exact hit. */
const EXACT_ASPECT_GATE_DEG = 1.5;

/** Noise cap: above this, NATAL_ASPECT events are truncated (slowest transiter kept first). */
const MAX_EVENTS = 250;

/** Truncation keep-priority: slowest first (lower = kept longer). */
const TRUNCATION_PRIORITY: Partial<Record<PlanetId, number>> = {
  PLUTO: 0, NEPTUNE: 1, URANUS: 2, CHIRON: 3, SATURN: 4, JUPITER: 5,
};

const SIGN_FULL_NAMES: Record<SignName, string> = {
  ARI: 'ARIES', TAU: 'TAURUS', GEM: 'GEMINI', CAN: 'CANCER',
  LEO: 'LEO', VIR: 'VIRGO', LIB: 'LIBRA', SCO: 'SCORPIO',
  SAG: 'SAGITTARIUS', CAP: 'CAPRICORN', AQU: 'AQUARIUS', PIS: 'PISCES',
};

/** House (1-12) containing the given longitude, honoring cusp wrap-around at 360°. */
function houseIndexForLongitude(longitude: number, houses: HouseCusp[]): number {
  const sorted = [...houses].sort((a, b) => a.house - b.house);
  for (let i = 0; i < sorted.length; i++) {
    const cusp = sorted[i].longitude;
    const nextCusp = sorted[(i + 1) % sorted.length].longitude;
    if (nextCusp > cusp) {
      if (longitude >= cusp && longitude < nextCusp) return sorted[i].house;
    } else {
      // Wraps around 360
      if (longitude >= cusp || longitude < nextCusp) return sorted[i].house;
    }
  }
  return 1;
}

/**
 * Exact-angle offsets to test for one aspect type. Asymmetric aspects
 * (sextile/square/trine) are exact at both +angle and -angle separation,
 * so both shifted angles must be checked to catch the transiting body
 * approaching the natal point from either side.
 */
export function shiftedAnglesFor(exactAngle: number): number[] {
  return exactAngle === 0 || exactAngle === 180 ? [exactAngle] : [exactAngle, 360 - exactAngle];
}

export interface TransitEventsComputationParams {
  /** Natal chart computed once by the caller (houses/angles may be null when birth time is unknown). */
  natal: NatalChartData;
  startDate: string;
  endDate: string;
  zodiacSystem?: ZodiacSystem;
  enabledPlanets?: PlanetId[];
}

/**
 * Detect transit events over a date window by daily sampling at noon UTC and
 * adjacent-day bracketing (same approach as `calculateEphemeris`):
 * - NATAL_ASPECT: signed-orb zero crossing gated at ±1.5°
 * - STATION_RETROGRADE / STATION_DIRECT: speed sign flip
 * - SIGN_INGRESS: sign index change
 * - HOUSE_INGRESS: natal-house index change (skipped when houses are null)
 * Events carry the later day of the bracket, matching the ephemeris convention.
 */
export function computeTransitEvents(params: TransitEventsComputationParams): TransitEventsData {
  const { natal, startDate, endDate } = params;
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';

  // Daily sampling at noon UTC. Compute the window length first — it selects
  // which transiters and aspect angles are in play.
  const start = parseDateString(startDate);
  const end = parseDateString(endDate);
  const startJd = toJulianDay(start.year, start.month, start.day, 12);
  const endJd = toJulianDay(end.year, end.month, end.day, 12);
  const days = Math.round(endJd - startJd) + 1;
  const isShortWindow = days <= SHORT_WINDOW_MAX_DAYS;

  // CHIRON participates when the caller enabled it (default planet set includes it).
  const chironEnabled = params.enabledPlanets ? params.enabledPlanets.includes('CHIRON') : true;

  // Sampled daily: Sun always (theme spine + aspects), personal fast movers +
  // outers (stations/ingresses), Chiron when enabled. Moon is never sampled —
  // its rhythm belongs to the daily dashboard, not a windowed report.
  const sampleSet: PlanetId[] = ['SUN', ...STATION_TRANSITERS];
  if (chironEnabled) sampleSet.push('CHIRON');

  // Stations: unchanged — the personal-through-outer movers that can retrograde.
  const stationSet = new Set<PlanetId>(STATION_TRANSITERS);

  // Sign/house ingress: the Sun always (its monthly house transit is the
  // report's backbone) and the outers/Chiron always; the fast movers only in
  // short windows, where their ingresses are signal rather than yearly noise.
  const ingressSet = new Set<PlanetId>(['SUN', ...OUTER_TRANSITERS]);
  if (chironEnabled) ingressSet.add('CHIRON');
  if (isShortWindow) for (const p of FAST_TRANSITERS) ingressSet.add(p);

  // Exact natal aspects, per transiter, with window-adaptive angle sets:
  //  - outers (+Chiron): all major aspects, both windows (rare, durable)
  //  - Sun: all majors in short windows, conjunction/opposition only in long
  //  - fast movers (Mercury/Venus/Mars): all majors, short windows only
  const aspectAnglesByPlanet = new Map<PlanetId, readonly [TransitEventAspectType, number][]>();
  for (const p of OUTER_TRANSITERS) aspectAnglesByPlanet.set(p, MAJOR_ASPECT_ANGLES);
  if (chironEnabled) aspectAnglesByPlanet.set('CHIRON', MAJOR_ASPECT_ANGLES);
  aspectAnglesByPlanet.set('SUN', isShortWindow ? MAJOR_ASPECT_ANGLES : CONJ_OPP_ANGLES);
  if (isShortWindow) for (const p of FAST_TRANSITERS) aspectAnglesByPlanet.set(p, MAJOR_ASPECT_ANGLES);

  // Natal aspect targets: natal planets + ASC/MC when a birth time is known.
  // `core` flags the ten classical points (+ angles) for the Sun's long-window
  // target restriction.
  const coreTargetSet = new Set<string>([...CORE_TARGET_PLANETS, 'ASC', 'MC']);
  const natalTargets: { name: string; longitude: number; core: boolean }[] =
    natal.planets.map((p) => ({ name: p.id, longitude: p.longitude, core: coreTargetSet.has(p.id) }));
  if (natal.angles) {
    natalTargets.push({ name: 'ASC', longitude: natal.angles.asc, core: true });
    natalTargets.push({ name: 'MC', longitude: natal.angles.mc, core: true });
  }

  const dates: string[] = [];
  const dailyPositions: PlanetPosition[][] = [];
  for (let i = 0; i < days; i++) {
    const jd = startJd + i;
    dates.push(fromJulianDay(jd).slice(0, 10));
    dailyPositions.push(calcPlanets(jd, sampleSet, zodiac));
  }

  // Adjacent-day bracketing detectors.
  const events: TransitEvent[] = [];
  for (let i = 0; i < dailyPositions.length - 1; i++) {
    const today = dailyPositions[i];
    const tomorrow = dailyPositions[i + 1];
    const date = dates[i + 1]; // event occurs on the later day

    for (const planet of today) {
      const next = tomorrow.find((p) => p.id === planet.id);
      if (!next) continue;

      // Stations: speed sign flip
      if (stationSet.has(planet.id)) {
        if (planet.speed >= 0 && next.speed < 0) {
          events.push({
            date, kind: 'STATION_RETROGRADE', transiting: planet.id,
            detail: `${planet.id} stations retrograde`,
          });
        }
        if (planet.speed < 0 && next.speed >= 0) {
          events.push({
            date, kind: 'STATION_DIRECT', transiting: planet.id,
            detail: `${planet.id} stations direct`,
          });
        }
      }

      // Sign/house ingress for ingress-eligible transiters.
      if (ingressSet.has(planet.id)) {
        // Sign ingress: sign index change
        if (planet.sign !== next.sign) {
          events.push({
            date, kind: 'SIGN_INGRESS', transiting: planet.id, sign: next.signName,
            detail: `${planet.id} enters ${SIGN_FULL_NAMES[next.signName]}`,
          });
        }

        // House ingress: natal-house index change (needs natal houses)
        if (natal.houses) {
          const houseToday = houseIndexForLongitude(planet.longitude, natal.houses);
          const houseTomorrow = houseIndexForLongitude(next.longitude, natal.houses);
          if (houseToday !== houseTomorrow) {
            events.push({
              date, kind: 'HOUSE_INGRESS', transiting: planet.id, house: houseTomorrow,
              detail: `${planet.id} enters natal house ${houseTomorrow}`,
            });
          }
        }
      }

      // Exact natal aspects: signed-orb zero crossing with ±1.5° gate, using
      // this transiter's window-adaptive angle set (absent = no aspects).
      const aspectAngles = aspectAnglesByPlanet.get(planet.id);
      if (aspectAngles) {
        // Long-window Sun aspects hit only the ten classical points + angles.
        const coreTargetsOnly = planet.id === 'SUN' && !isShortWindow;
        for (const target of natalTargets) {
          if (coreTargetsOnly && !target.core) continue;
          for (const [aspectType, exactAngle] of aspectAngles) {
            for (const shifted of shiftedAnglesFor(exactAngle)) {
              const orbToday = signedAspectOrb(planet.longitude, target.longitude, shifted);
              const orbTomorrow = signedAspectOrb(next.longitude, target.longitude, shifted);
              if (Math.abs(orbToday) <= EXACT_ASPECT_GATE_DEG && orbToday * orbTomorrow < 0) {
                events.push({
                  date, kind: 'NATAL_ASPECT', transiting: planet.id,
                  natal: target.name, aspectType,
                  detail: `${planet.id} ${aspectType} natal ${target.name}`,
                });
              }
            }
          }
        }
      }
    }
  }

  // Generated in date order already; sort defensively (stable).
  events.sort((a, b) => a.date.localeCompare(b.date));

  // Noise cap: keep all structural events, truncate NATAL_ASPECT
  // (slowest transiting planet first, then date order).
  const totalDetected = events.length;
  let finalEvents = events;
  let truncated = false;
  if (events.length > MAX_EVENTS) {
    truncated = true;
    const structuralCount = events.filter((e) => e.kind !== 'NATAL_ASPECT').length;
    const slots = Math.max(0, MAX_EVENTS - structuralCount);
    const keptAspects = new Set(
      events
        .filter((e) => e.kind === 'NATAL_ASPECT')
        .sort((a, b) =>
          ((TRUNCATION_PRIORITY[a.transiting] ?? 99) - (TRUNCATION_PRIORITY[b.transiting] ?? 99)) ||
          a.date.localeCompare(b.date))
        .slice(0, slots),
    );
    finalEvents = events.filter((e) => e.kind !== 'NATAL_ASPECT' || keptAspects.has(e));
  }

  // Structural context: where the transiting Sun sits at the window start, so
  // even a near-empty event list still gives a report its "theme" backbone.
  const sunAtStart = dailyPositions[0]?.find((p) => p.id === 'SUN');
  const sunNatalHouseAtStart =
    sunAtStart && natal.houses ? houseIndexForLongitude(sunAtStart.longitude, natal.houses) : null;
  const context = {
    sunSignAtStart: (sunAtStart?.signName ?? natal.planets.find((p) => p.id === 'SUN')?.signName ?? 'ARI') as SignName,
    sunNatalHouseAtStart,
    // Houses 7–12 are above the horizon (outward-facing), 1–6 below (inward).
    sunHemisphereAtStart:
      sunNatalHouseAtStart === null ? null : sunNatalHouseAtStart >= 7 ? ('upper' as const) : ('lower' as const),
  };

  return {
    window: { startDate, endDate, days },
    events: finalEvents,
    context,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      calculatedAt: new Date().toISOString(),
      truncated,
      totalDetected,
    },
  };
}
