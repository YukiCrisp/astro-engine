import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { initSweph, calcSinglePlanet } from '../../src/engine/sweph-adapter.js';
import { calculateForecast, calculateNatal } from '../../src/engine/index.js';
import { signedAspectOrb } from '../../src/engine/calculations/transit-events.js';
import {
  getProgressedJulianDay, progressedJdFromRealJd, progressionClock, realJdFromProgressedJd,
} from '../../src/engine/calculations/progressions.js';
import { ForecastRequestSchema } from '../../src/schemas/forecast.js';
import { toJulianDay } from '../../src/utils/date.js';
import type { ForecastData, ForecastRow, ForecastTarget, NatalChartData, PlanetId, ZodiacSystem } from '../../src/engine/types.js';

const base = {
  birthDate: '1990-04-15',
  birthTime: '14:30' as string | null,
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};
const ALL_TARGETS: ForecastTarget[] = [
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'ASC', 'MC',
];
const ALL_ASPECTS = ['CONJUNCTION', 'OPPOSITION', 'TRINE', 'SQUARE', 'SEXTILE'] as const;
const SLOW: PlanetId[] = ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'CHIRON'];
const PROGRESSED: PlanetId[] = ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS'];

/** ISO "YYYY-MM-DDTHH:MM:SSZ" → UT Julian day. */
function isoToJd(iso: string): number {
  const [d, t] = iso.slice(0, 19).split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss] = t.split(':').map(Number);
  return toJulianDay(y, m, day, hh + mm / 60 + ss / 3600);
}

function targetLongitude(natal: NatalChartData, target: ForecastTarget): number {
  if (target === 'ASC') return natal.angles!.asc;
  if (target === 'MC') return natal.angles!.mc;
  return natal.planets.find((p) => p.id === target)!.longitude;
}

function orbAt(row: ForecastRow, natal: NatalChartData, jd: number, zodiac: ZodiacSystem = 'tropical'): number {
  return signedAspectOrb(calcSinglePlanet(jd, row.mover, zodiac).longitude, targetLongitude(natal, row.target), row.angle);
}

const find = (data: ForecastData, mover: PlanetId, aspect: string, target: ForecastTarget) =>
  data.rows.filter((r) => r.mover === mover && r.aspect === aspect && r.target === target);

let natal: NatalChartData;
let transitYear: ForecastData;
let transitDecade: ForecastData;
let progressedDecade: ForecastData;
const clock = progressionClock(base.birthDate, base.birthTime, base.utcOffsetMinutes);

beforeAll(() => {
  initSweph('./ephe');
  natal = calculateNatal({ ...base, enabledPlanets: ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'] });
  const common = { ...base, targets: ALL_TARGETS, aspects: [...ALL_ASPECTS] };
  transitYear = calculateForecast({ ...common, method: 'transit', startDate: '2026-11-04', endDate: '2027-11-03', movers: SLOW, orb: 3 });
  transitDecade = calculateForecast({ ...common, method: 'transit', startDate: '2026-11-04', endDate: '2036-11-03', movers: SLOW, orb: 3 });
  progressedDecade = calculateForecast({ ...common, method: 'progressed', startDate: '2026-11-04', endDate: '2036-11-03', movers: PROGRESSED, orb: 1 });
});

describe('progression clock', () => {
  it('keeps getProgressedJulianDay on the same day-for-a-year clock', () => {
    const viaClock = progressedJdFromRealJd(clock, toJulianDay(2026, 11, 4, 0));
    expect(getProgressedJulianDay(base.birthDate, base.birthTime, base.utcOffsetMinutes, '2026-11-04')).toBeCloseTo(viaClock, 9);
  });

  it('maps real and progressed moments back and forth', () => {
    const real = toJulianDay(2031, 6, 1, 7.25);
    expect(realJdFromProgressedJd(clock, progressedJdFromRealJd(clock, real))).toBeCloseTo(real, 6);
  });
});

describe('calculateForecast — transit', () => {
  it('perfects at every reported exact moment', () => {
    const exacts = transitYear.rows.flatMap((r) => r.exacts.map((e) => ({ r, jd: isoToJd(e.at) })));
    expect(exacts.length).toBeGreaterThan(20);
    for (const { r, jd } of exacts) expect(Math.abs(orbAt(r, natal, jd))).toBeLessThan(0.01);
  });

  it('enters and leaves the orb at the segment edges', () => {
    for (const r of transitYear.rows) {
      r.segments.forEach((s, i) => {
        if (!(i === 0 && r.openStart)) expect(Math.abs(orbAt(r, natal, isoToJd(s.enter)))).toBeCloseTo(3, 1);
        if (!(i === r.segments.length - 1 && r.openEnd)) expect(Math.abs(orbAt(r, natal, isoToJd(s.leave)))).toBeCloseTo(3, 1);
      });
    }
  });

  it('keeps only rows with an in-orb stretch inside the window', () => {
    const start = '2026-11-04';
    const end = '2027-11-04';
    for (const r of transitYear.rows) {
      expect(r.segments.some((s) => s.enter < end && s.leave >= start)).toBe(true);
    }
  });

  it('puts a retrograde triple pass on one row: direct, retrograde, direct', () => {
    const triples = transitYear.rows.filter((r) => r.exacts.length === 3);
    expect(triples.length).toBeGreaterThan(0);
    for (const r of triples) {
      expect(r.exacts.map((e) => e.retrograde)).toEqual([false, true, false]);
      expect(r.segments.length).toBeGreaterThanOrEqual(1);
    }
    // Jupiter in Leo trines the natal Sun (25° Aries) three times around its 2026-27 station.
    const [jupiterSun] = find(transitYear, 'JUPITER', 'TRINE', 'SUN');
    expect(jupiterSun.exacts).toHaveLength(3);
  });

  it('keeps Jupiter returning to the same angle a cycle later as a separate row', () => {
    const rows = find(transitDecade, 'JUPITER', 'TRINE', 'SUN').filter((r) => r.angle === 120);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      const span = isoToJd(r.segments[r.segments.length - 1].leave) - isoToJd(r.segments[0].enter);
      expect(span).toBeLessThan(2 * 365);
    }
  });

  it('follows a slow planet past the window start instead of cutting it', () => {
    const plutoRows = transitDecade.rows.filter((r) => r.mover === 'PLUTO');
    expect(plutoRows.length).toBeGreaterThan(0);
    for (const r of plutoRows) expect(r.openStart || r.openEnd).toBe(false);
    expect(transitYear.rows.some((r) => r.segments[0].enter < '2026-11-04')).toBe(true);
  });

  it('gives the closest approach for rows that never perfect', () => {
    for (const r of transitDecade.rows.filter((x) => x.exacts.length === 0)) {
      expect(r.closest.orb).toBeGreaterThan(0);
      expect(r.closest.orb).toBeLessThanOrEqual(3);
    }
  });

  it('finds a fast mover passing between two daily samples with a tiny orb', () => {
    const data = calculateForecast({
      ...base, method: 'transit', startDate: '2026-11-04', endDate: '2027-01-31',
      movers: ['MERCURY'], targets: ALL_TARGETS, aspects: [...ALL_ASPECTS], orb: 0.1,
    });
    // Mercury covers 1–2° a day, so a 0.1° orb is never caught by a daily sample.
    expect(data.rows.length).toBeGreaterThan(5);
    for (const r of data.rows) {
      expect(r.exacts.length).toBeGreaterThan(0);
      for (const e of r.exacts) expect(Math.abs(orbAt(r, natal, isoToJd(e.at)))).toBeLessThan(0.01);
    }
  });

  it('drops ASC and MC when the birth time is unknown', () => {
    const data = calculateForecast({
      ...base, birthTime: null, method: 'transit', startDate: '2026-11-04', endDate: '2027-11-03',
      movers: SLOW, targets: ALL_TARGETS, aspects: [...ALL_ASPECTS], orb: 3,
    });
    expect(data.meta.birthTimeAssumed).toBe(true);
    expect(data.rows.some((r) => r.target === 'ASC' || r.target === 'MC')).toBe(false);
    expect(data.rows.length).toBeGreaterThan(0);
  });

  it('measures sidereal exacts against the sidereal natal chart', () => {
    const data = calculateForecast({
      ...base, zodiacSystem: 'sidereal', method: 'transit', startDate: '2026-11-04', endDate: '2027-11-03',
      movers: ['SATURN'], targets: ['SUN', 'MOON'], aspects: [...ALL_ASPECTS], orb: 3,
    });
    const sidNatal = calculateNatal({ ...base, zodiacSystem: 'sidereal', enabledPlanets: ['SUN', 'MOON'] });
    expect(data.rows.length).toBeGreaterThan(0);
    for (const r of data.rows) for (const e of r.exacts) {
      expect(Math.abs(orbAt(r, sidNatal, isoToJd(e.at), 'sidereal'))).toBeLessThan(0.01);
    }
  });
});

describe('calculateForecast — progressed', () => {
  it('perfects (to within a day of progressed motion) at every exact', () => {
    const exacts = progressedDecade.rows.flatMap((r) => r.exacts.map((e) => ({ r, jd: isoToJd(e.at) })));
    expect(exacts.length).toBeGreaterThan(10);
    for (const { r, jd } of exacts) {
      // The progressed Moon moves ~0.036° per real day; the bisection stops at one day.
      expect(Math.abs(orbAt(r, natal, progressedJdFromRealJd(clock, jd)))).toBeLessThan(0.05);
    }
  });

  it('lists the progressed Moon about once a month or two', () => {
    const moonRows = progressedDecade.rows.filter((r) => r.mover === 'MOON');
    // ~130° of progressed Moon in ten years against 12 targets × 8 angles.
    expect(moonRows.length).toBeGreaterThan(30);
    for (const r of moonRows) {
      const span = isoToJd(r.segments[r.segments.length - 1].leave) - isoToJd(r.segments[0].enter);
      expect(span).toBeLessThan(120);
    }
  });

  it('does not join returns more than five years apart', () => {
    for (const r of progressedDecade.rows) {
      for (let i = 1; i < r.segments.length; i++) {
        expect(isoToJd(r.segments[i].enter) - isoToJd(r.segments[i - 1].leave)).toBeLessThanOrEqual(1826 + 7);
      }
    }
  });
});

describe('ForecastRequestSchema', () => {
  const request = {
    ...base, method: 'transit', startDate: '2026-11-04', endDate: '2027-11-03',
    movers: ['SATURN'], targets: ['SUN'], aspects: ['CONJUNCTION'], orb: 3,
  };

  it('accepts a one-year slow-planet transit request', () => {
    expect(ForecastRequestSchema.safeParse(request).success).toBe(true);
  });

  it('rejects windows longer than ten years', () => {
    expect(ForecastRequestSchema.safeParse({ ...request, endDate: '2036-11-05' }).success).toBe(false);
    expect(ForecastRequestSchema.safeParse({ ...request, endDate: '2036-11-03' }).success).toBe(true);
  });

  it('allows the fast transiting planets only in windows up to 92 days', () => {
    expect(ForecastRequestSchema.safeParse({ ...request, movers: ['MARS'] }).success).toBe(false);
    expect(ForecastRequestSchema.safeParse({ ...request, movers: ['MARS'], endDate: '2027-02-03' }).success).toBe(true);
  });

  it('never lets the Moon transit, and allows only Sun–Mars to progress', () => {
    expect(ForecastRequestSchema.safeParse({ ...request, movers: ['MOON'] }).success).toBe(false);
    expect(ForecastRequestSchema.safeParse({ ...request, method: 'progressed', movers: ['MOON'] }).success).toBe(true);
    expect(ForecastRequestSchema.safeParse({ ...request, method: 'progressed', movers: ['JUPITER'] }).success).toBe(false);
  });

  it('refuses progressions without a birth time', () => {
    expect(ForecastRequestSchema.safeParse({ ...request, method: 'progressed', movers: ['SUN'], birthTime: null }).success).toBe(false);
  });
});

describe('POST /v1/charts/forecast', () => {
  const payload = {
    ...base, method: 'transit', startDate: '2026-11-04', endDate: '2027-11-03',
    movers: ['SATURN'], targets: ['SUN', 'MOON'], aspects: ['CONJUNCTION', 'SQUARE'], orb: 3,
  };

  it('answers with rows', async () => {
    const app = await buildApp();
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/v1/charts/forecast', payload });
    await app.close();
    expect(response.statusCode).toBe(200);
    const body = response.json() as ForecastData;
    expect(body.method).toBe('transit');
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows[0]).toHaveProperty('angle');
  });

  it('answers 400 for progressions without a birth time', async () => {
    const app = await buildApp();
    await app.ready();
    const response = await app.inject({
      method: 'POST', url: '/v1/charts/forecast',
      payload: { ...payload, method: 'progressed', movers: ['SUN'], birthTime: null },
    });
    await app.close();
    expect(response.statusCode).toBe(400);
  });
});
