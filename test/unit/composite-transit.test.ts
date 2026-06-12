import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateCompositeTransit, calculateComposite } from '../../src/engine/index.js';

beforeAll(() => {
  initSweph('./ephe');
});

// Two persons → composite chart, then transits for a fixed date.
const personA = {
  birthDate: '1990-04-15',
  birthTime: '14:30',
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};
const personB = {
  birthDate: '1988-11-02',
  birthTime: '08:15',
  lat: 34.6937,
  lon: 135.5023,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};
const transit = {
  transitDate: '2026-06-15',
  transitTime: '12:00',
  lat: 35.6762,
  lon: 139.6503,
  utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

describe('calculateCompositeTransit', () => {
  it('returns composite, transit, and cross-aspects', () => {
    const result = calculateCompositeTransit({ personA, personB, transit });
    expect(result.composite.planets.length).toBeGreaterThan(0);
    expect(result.transit.planets.length).toBeGreaterThan(0);
    expect(Array.isArray(result.crossAspects)).toBe(true);
    expect(result.meta.schemaVersion).toBeGreaterThan(0);
  });

  it('reuses the same midpoint composite as calculateComposite', () => {
    const ct = calculateCompositeTransit({ personA, personB, transit });
    const composite = calculateComposite({ personA, personB });
    const ctSun = ct.composite.planets.find((p) => p.id === 'SUN')!;
    const compSun = composite.planets.find((p) => p.id === 'SUN')!;
    expect(ctSun.longitude).toBeCloseTo(compSun.longitude, 6);
  });

  it('cross-aspects connect composite planets to transiting planets with applying flag', () => {
    const { composite, transit: tr, crossAspects } = calculateCompositeTransit({ personA, personB, transit });
    const compIds = new Set(composite.planets.map((p) => p.id));
    const trIds = new Set(tr.planets.map((p) => p.id));
    for (const a of crossAspects) {
      // planetA is a composite body, planetB is a transiting body
      expect(compIds.has(a.planetA)).toBe(true);
      expect(trIds.has(a.planetB)).toBe(true);
      // transit has time evolution → applying is computed (boolean, not undefined)
      expect(typeof a.applying).toBe('boolean');
      expect(a.orb).toBeGreaterThanOrEqual(0);
    }
  });
});
