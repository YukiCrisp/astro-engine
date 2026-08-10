import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import {
  calculateNatal, calculateNatalAnalysis, calculateProgressed, calculateTransit,
  calculateComposite, calculateSolarArc, calculateSolarReturn, calculateLunarReturn,
} from '../../src/engine/index.js';

/**
 * ENGA-2976 (decision C): an unknown birth time no longer suppresses houses
 * and angles. The engine assumes local noon — the same assumption it has
 * always made for the planets — and reports it as `meta.birthTimeAssumed`.
 *
 * Two properties have to hold together, and both are load-bearing:
 *   1. the fields are populated (so all eleven report chapters can be written)
 *   2. the assumption is machine-readable (so the reader is never told an
 *      assumed ASC is a measured one — the hole ENGA-2866 closed)
 * A test suite that checked only (1) would pass on an implementation that
 * reopens that hole, so every case below asserts the flag as well.
 */

const person = {
  birthDate: '1990-04-15',
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

describe('unknown birth time — natal', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  it('returns houses and angles, flagged as assumed', () => {
    const chart = calculateNatal({ ...person, birthTime: null });

    expect(chart.meta.birthTimeAssumed).toBe(true);
    expect(chart.angles).not.toBeNull();
    expect(chart.houses).not.toBeNull();
    expect(chart.houses).toHaveLength(12);
    expect(chart.angles!.asc).toBeGreaterThanOrEqual(0);
    expect(chart.angles!.asc).toBeLessThan(360);
    // Part of fortune is ASC-derived, so it too is only as good as the assumption.
    expect(chart.angles!.partOfFortune).not.toBe(0);
  });

  it('a known birth time is not flagged', () => {
    const chart = calculateNatal({ ...person, birthTime: '14:30' });
    expect(chart.meta.birthTimeAssumed).toBe(false);
    expect(chart.angles).not.toBeNull();
  });

  it('the assumption is literally local noon, not some other hour', () => {
    const assumed = calculateNatal({ ...person, birthTime: null });
    const noon = calculateNatal({ ...person, birthTime: '12:00' });

    expect(assumed.angles!.asc).toBeCloseTo(noon.angles!.asc, 9);
    expect(assumed.angles!.mc).toBeCloseTo(noon.angles!.mc, 9);
    expect(assumed.houses![0].longitude).toBeCloseTo(noon.houses![0].longitude, 9);
    // Same chart, opposite claim about how much it can be trusted.
    expect(noon.meta.birthTimeAssumed).toBe(false);
  });

  it('is nowhere near the chart for a different hour — the flag is not cosmetic', () => {
    const assumed = calculateNatal({ ...person, birthTime: null });
    const evening = calculateNatal({ ...person, birthTime: '20:00' });
    const ascGap = Math.abs(((assumed.angles!.asc - evening.angles!.asc + 540) % 360) - 180);
    // 8 hours of rotation ≈ 4 signs of ASC travel; anything less would mean
    // the noon assumption were harmless, which it is not.
    expect(ascGap).toBeGreaterThan(60);
  });

  it('computes Arabic parts from the assumed angles rather than dropping them', () => {
    const chart = calculateNatal({
      ...person, birthTime: null, enabledArabicParts: ['PART_OF_FORTUNE'],
    });
    expect(chart.meta.birthTimeAssumed).toBe(true);
    expect(chart.arabicParts).toHaveLength(1);
  });
});

describe('unknown birth time — natal analysis', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  it('fills in the house-dependent analysis and keeps the flag', () => {
    const result = calculateNatalAnalysis({ ...person, birthTime: null });
    expect(result.meta.birthTimeAssumed).toBe(true);
    // The quadrant split is house-derived, so it was empty for every planet
    // before ENGA-2976; the culminating planet needs angles for the same reason.
    const quadrantPlanets = Object.values(result.analysis.distribution.quadrants).flat();
    const known = calculateNatalAnalysis({ ...person, birthTime: '14:30' });
    const knownQuadrantPlanets = Object.values(known.analysis.distribution.quadrants).flat();

    expect(quadrantPlanets.length).toBeGreaterThan(0);
    expect(quadrantPlanets.length).toBe(knownQuadrantPlanets.length);
    expect(result.analysis.culminatingPlanet).not.toBeNull();
    expect(known.meta.birthTimeAssumed).toBe(false);
  });
});

describe('unknown birth time — derived charts', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  it('progressed: houses and angles at the assumed noon', () => {
    const chart = calculateProgressed({ ...person, birthTime: null, progressedDate: '2026-08-07' });
    expect(chart.meta.birthTimeAssumed).toBe(true);
    expect(chart.angles).not.toBeNull();
    expect(chart.houses).toHaveLength(12);

    const noon = calculateProgressed({ ...person, birthTime: '12:00', progressedDate: '2026-08-07' });
    expect(chart.angles!.asc).toBeCloseTo(noon.angles!.asc, 9);
    expect(noon.meta.birthTimeAssumed).toBe(false);
  });

  it('solar arc: houses and angles at the assumed noon', () => {
    const chart = calculateSolarArc({ ...person, birthTime: null, progressedDate: '2026-08-07' });
    expect(chart.meta.birthTimeAssumed).toBe(true);
    expect(chart.angles).not.toBeNull();
    expect(chart.houses).toHaveLength(12);
  });

  it('solar return: flagged, because the return moment itself is solved from the assumed natal Sun', () => {
    const params = {
      ...person, year: 2026,
      returnLat: person.lat, returnLon: person.lon, returnUtcOffsetMinutes: 540,
    };
    expect(calculateSolarReturn({ ...params, birthTime: null }).meta.birthTimeAssumed).toBe(true);
    expect(calculateSolarReturn({ ...params, birthTime: '14:30' }).meta.birthTimeAssumed).toBe(false);
  });

  it('lunar return: flagged for the same reason', () => {
    const params = {
      ...person, targetDate: '2026-08-01',
      returnLat: person.lat, returnLon: person.lon, returnUtcOffsetMinutes: 540,
    };
    expect(calculateLunarReturn({ ...params, birthTime: null }).meta.birthTimeAssumed).toBe(true);
    expect(calculateLunarReturn({ ...params, birthTime: '14:30' }).meta.birthTimeAssumed).toBe(false);
  });
});

describe('unknown birth time — composite', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  const personB = {
    birthDate: '1988-11-02',
    lat: 34.6937,
    lon: 135.5023,
    utcOffsetMinutes: 540,
    houseSystem: 'PLACIDUS' as const,
  };

  it('builds the midpoint angles when one partner has no birth time, and flags the pair', () => {
    const chart = calculateComposite({
      personA: { ...person, birthTime: '14:30' },
      personB: { ...personB, birthTime: null },
    });
    expect(chart.meta.birthTimeAssumed).toBe(true);
    expect(chart.angles).not.toBeNull();
    expect(chart.houses).toHaveLength(12);
    // Equal houses from the composite ASC — the wheel must still agree with itself.
    expect(chart.houses![0].longitude).toBeCloseTo(chart.angles!.asc, 9);
  });

  it('is unflagged only when both birth times are known', () => {
    const chart = calculateComposite({
      personA: { ...person, birthTime: '14:30' },
      personB: { ...personB, birthTime: '08:15' },
    });
    expect(chart.meta.birthTimeAssumed).toBe(false);
    expect(chart.angles).not.toBeNull();
  });

  it('flags a pair where neither birth time is known', () => {
    const chart = calculateComposite({
      personA: { ...person, birthTime: null },
      personB: { ...personB, birthTime: null },
    });
    expect(chart.meta.birthTimeAssumed).toBe(true);
    expect(chart.angles).not.toBeNull();
  });
});

describe('transit charts keep the old behaviour', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  it('a transit without a time still returns no houses, and says the time was assumed', () => {
    // Deliberate carve-out: a transit moment is chosen by the caller, so
    // "no time given" means "this date", not "a time I cannot recall".
    // Decision C is about the unknown birth time only.
    const chart = calculateTransit({
      transitDate: '2026-08-07', transitTime: null,
      lat: person.lat, lon: person.lon,
      utcOffsetMinutes: 540, houseSystem: 'PLACIDUS',
    });
    expect(chart.houses).toBeNull();
    expect(chart.angles).toBeNull();
    expect(chart.meta.birthTimeAssumed).toBe(true);
  });

  it('a transit with a time is unflagged and has houses', () => {
    const chart = calculateTransit({
      transitDate: '2026-08-07', transitTime: '09:00',
      lat: person.lat, lon: person.lon,
      utcOffsetMinutes: 540, houseSystem: 'PLACIDUS',
    });
    expect(chart.meta.birthTimeAssumed).toBe(false);
    expect(chart.houses).toHaveLength(12);
  });
});
