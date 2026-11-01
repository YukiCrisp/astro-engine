import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { calculateNatal, calculateProgressed } from '../../src/engine/index.js';
import { NatalChartDataSchema } from '../../src/schemas/responses.js';

beforeAll(() => {
  initSweph('./ephe');
});

const birth = { birthDate: '1990-01-15', birthTime: '12:00', utcOffsetMinutes: 540, lon: 44.81 } as const;
const natal = (lat: number, houseSystem: 'PLACIDUS' | 'KOCH' | 'PORPHYRY' | 'REGIOMONTANUS' | 'CAMPANUS' | 'EQUAL') =>
  calculateNatal({ ...birth, lat, houseSystem });

describe('meta.houseSystemFallback', () => {
  it('reports Porphyry when Placidus or Koch is asked for inside the polar circle', () => {
    for (const hs of ['PLACIDUS', 'KOCH'] as const) {
      const chart = natal(70, hs);
      expect(chart.meta.houseSystem).toBe(hs);
      expect(chart.meta.houseSystemFallback).toBe('PORPHYRY');
      // The cusps really are Porphyry's.
      const porphyry = natal(70, 'PORPHYRY');
      expect(chart.houses!.map((h) => h.longitude)).toEqual(porphyry.houses!.map((h) => h.longitude));
    }
  });

  it('is absent outside the polar circle and for systems that still compute there', () => {
    expect(natal(66.1, 'PLACIDUS').meta.houseSystemFallback).toBeUndefined();
    expect(natal(-60, 'KOCH').meta.houseSystemFallback).toBeUndefined();
    for (const hs of ['REGIOMONTANUS', 'CAMPANUS', 'EQUAL'] as const) {
      expect(natal(70, hs).meta.houseSystemFallback).toBeUndefined();
    }
  });

  it('also covers the southern polar circle and the relocated progressed chart', () => {
    expect(natal(-70, 'PLACIDUS').meta.houseSystemFallback).toBe('PORPHYRY');
    const progressed = calculateProgressed({
      ...birth, lat: 35, houseSystem: 'PLACIDUS', progressedDate: '2026-11-01', relocatedLat: 70, relocatedLon: 20,
    });
    expect(progressed.meta.houseSystemFallback).toBe('PORPHYRY');
  });

  it('survives the response schema', () => {
    const parsed = NatalChartDataSchema.parse(natal(70, 'PLACIDUS'));
    expect(parsed.meta.houseSystemFallback).toBe('PORPHYRY');
  });
});
