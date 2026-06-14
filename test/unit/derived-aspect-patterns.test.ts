import { describe, it, expect, beforeAll } from 'vitest';
import {
  attachAspectPatterns,
  calculateComposite,
  calculateProgressed,
  calculateSolarArc,
  calculateSolarReturn,
  calculateLunarReturn,
  calculateTransit,
} from '../../src/engine/index.js';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import { SCHEMA_VERSION } from '../../src/engine/types.js';
import type { NatalChartData } from '../../src/engine/types.js';
import { makePlanet, makeAspect } from './aspect-pattern-helpers.js';

/**
 * ENGA-252: composite + derived single charts must carry the same special
 * aspect patterns (grand trine, T-square, …) as natal does. The detection is
 * shared via `attachAspectPatterns`, which reuses `detectAspectPatterns` — the
 * exact path `analyzeChart` uses for natal-analysis.
 */

// A self-contained fire grand trine: SUN(ARI) – JUPITER(LEO) – NEPTUNE(SAG),
// each pair 120° apart. No ephemeris needed → deterministic.
function fireGrandTrineChart(): NatalChartData {
  return {
    planets: [
      makePlanet('SUN', 5),       // ARI (fire)
      makePlanet('JUPITER', 125), // LEO (fire)
      makePlanet('NEPTUNE', 245), // SAG (fire)
    ],
    houses: null,
    angles: null,
    aspects: [
      makeAspect('SUN', 'JUPITER', 'TRINE', 120, 0),
      makeAspect('JUPITER', 'NEPTUNE', 'TRINE', 120, 0),
      makeAspect('SUN', 'NEPTUNE', 'TRINE', 120, 0),
    ],
    meta: {
      schemaVersion: SCHEMA_VERSION,
      calculatedAt: '2026-06-15T00:00:00.000Z',
      houseSystem: 'PLACIDUS',
      zodiacSystem: 'tropical',
      julianDay: 0,
    },
  };
}

describe('attachAspectPatterns', () => {
  it('adds an aspectPatterns array while preserving the original chart', () => {
    const chart = fireGrandTrineChart();
    const withPatterns = attachAspectPatterns(chart);

    expect(Array.isArray(withPatterns.aspectPatterns)).toBe(true);
    // original fields are kept intact
    expect(withPatterns.planets).toBe(chart.planets);
    expect(withPatterns.aspects).toBe(chart.aspects);
    expect(withPatterns.meta).toBe(chart.meta);
  });

  it('detects the special aspect pattern in the chart geometry', () => {
    const { aspectPatterns } = attachAspectPatterns(fireGrandTrineChart());
    const grandTrine = aspectPatterns.find((p) => p.type === 'GRAND_TRINE');
    expect(grandTrine).toBeDefined();
    expect(grandTrine!.element).toBe('FIRE');
    expect(new Set(grandTrine!.planets)).toEqual(new Set(['SUN', 'JUPITER', 'NEPTUNE']));
  });

  it('returns an empty array when no special pattern is present', () => {
    const chart: NatalChartData = {
      planets: [makePlanet('SUN', 0), makePlanet('MOON', 10)],
      houses: null,
      angles: null,
      aspects: [makeAspect('SUN', 'MOON', 'CONJUNCTION', 0, 10)],
      meta: {
        schemaVersion: SCHEMA_VERSION,
        calculatedAt: '2026-06-15T00:00:00.000Z',
        houseSystem: 'PLACIDUS',
        zodiacSystem: 'tropical',
        julianDay: 0,
      },
    };
    expect(attachAspectPatterns(chart).aspectPatterns).toEqual([]);
  });
});

// Smoke test the wiring on real ephemeris-backed charts: every target single
// chart must expose `aspectPatterns` once routed through attachAspectPatterns.
describe('derived single charts expose aspectPatterns', () => {
  beforeAll(() => {
    initSweph('./ephe');
  });

  const person = {
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

  it('composite', () => {
    const r = attachAspectPatterns(calculateComposite({ personA: person, personB }));
    expect(Array.isArray(r.aspectPatterns)).toBe(true);
  });

  it('progressed', () => {
    const r = attachAspectPatterns(calculateProgressed({ ...person, progressedDate: '2026-06-15' }));
    expect(Array.isArray(r.aspectPatterns)).toBe(true);
  });

  it('solar arc', () => {
    const r = attachAspectPatterns(calculateSolarArc({ ...person, progressedDate: '2026-06-15' }));
    expect(Array.isArray(r.aspectPatterns)).toBe(true);
  });

  it('solar return', () => {
    const r = attachAspectPatterns(calculateSolarReturn({
      ...person, year: 2026,
      returnLat: 35.6762, returnLon: 139.6503, returnUtcOffsetMinutes: 540,
    }));
    expect(Array.isArray(r.aspectPatterns)).toBe(true);
  });

  it('lunar return', () => {
    const r = attachAspectPatterns(calculateLunarReturn({
      ...person, targetDate: '2026-06-15',
      returnLat: 35.6762, returnLon: 139.6503, returnUtcOffsetMinutes: 540,
    }));
    expect(Array.isArray(r.aspectPatterns)).toBe(true);
  });

  it('transit', () => {
    const r = attachAspectPatterns(calculateTransit({
      transitDate: '2026-06-15', transitTime: '12:00',
      lat: 35.6762, lon: 139.6503, utcOffsetMinutes: 540, houseSystem: 'PLACIDUS',
    }));
    expect(Array.isArray(r.aspectPatterns)).toBe(true);
  });
});
