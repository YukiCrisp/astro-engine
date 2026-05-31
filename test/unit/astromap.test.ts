import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import {
  computeAstromapLines,
  normalizeLon,
  angularDiff,
  gmstDeg,
  ASTROMAP_PLANETS,
} from '../../src/engine/calculations/astrocartography.js';
import { buildJulianDay } from '../../src/utils/date.js';

beforeAll(() => {
  initSweph('./ephe');
});

describe('normalizeLon', () => {
  it('keeps values inside [-180, 180)', () => {
    expect(normalizeLon(0)).toBe(0);
    expect(normalizeLon(179)).toBe(179);
    expect(normalizeLon(-179)).toBe(-179);
  });

  it('wraps positive overflow', () => {
    expect(normalizeLon(200)).toBe(-160);
    expect(normalizeLon(540)).toBe(-180);
  });

  it('wraps negative overflow', () => {
    expect(normalizeLon(-200)).toBe(160);
    expect(normalizeLon(-540)).toBe(-180);
  });
});

describe('angularDiff', () => {
  it('returns 0 when angles match', () => {
    expect(angularDiff(45, 45)).toBeCloseTo(0, 5);
    expect(angularDiff(0, 360)).toBeCloseTo(0, 5);
  });

  it('returns signed difference in (-180, 180]', () => {
    expect(angularDiff(10, 0)).toBeCloseTo(10, 5);
    expect(angularDiff(0, 10)).toBeCloseTo(-10, 5);
  });

  it('wraps across 0/360', () => {
    expect(angularDiff(355, 5)).toBeCloseTo(-10, 5);
    expect(angularDiff(5, 355)).toBeCloseTo(10, 5);
  });

  it('crosses zero exactly where targets coincide', () => {
    const a = angularDiff(89.99, 90);
    const b = angularDiff(90.01, 90);
    expect(a).toBeLessThan(0);
    expect(b).toBeGreaterThan(0);
  });
});

describe('gmstDeg', () => {
  it('returns a value in [0, 360)', () => {
    const g = gmstDeg(2451545.0); // J2000
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThan(360);
  });

  it('advances by ~360.985° per day (sidereal day)', () => {
    const g0 = gmstDeg(2451545.0);
    const g1 = gmstDeg(2451546.0);
    const delta = ((g1 - g0) % 360 + 360) % 360;
    expect(delta).toBeGreaterThan(0.5);
    expect(delta).toBeLessThan(1.5);
  });
});

describe('computeAstromapLines', () => {
  // Use Einstein's birth as a known reference moment.
  const jd = buildJulianDay('1879-03-14', '11:30', 54);

  it('returns four lines per planet (MC, IC, AC, DC)', () => {
    const lines = computeAstromapLines(jd, ['SUN', 'MOON']);
    expect(lines).toHaveLength(8);
    const types = new Set(lines.map((l) => l.lineType));
    expect(types).toEqual(new Set(['MC', 'IC', 'AC', 'DC']));
  });

  it('skips planets outside the supported astromap set', () => {
    const lines = computeAstromapLines(jd, ['SUN', 'CHIRON', 'CERES']);
    const planetIds = new Set(lines.map((l) => l.planetId));
    expect(planetIds).toEqual(new Set(['SUN']));
  });

  it('MC and IC for the same planet share constant longitudes 180° apart', () => {
    const lines = computeAstromapLines(jd, ['SUN']);
    const mc = lines.find((l) => l.lineType === 'MC')!;
    const ic = lines.find((l) => l.lineType === 'IC')!;
    expect(mc.points.length).toBeGreaterThan(0);
    expect(ic.points.length).toBeGreaterThan(0);

    const mcLon = mc.points[0].lon;
    const icLon = ic.points[0].lon;
    for (const p of mc.points) expect(p.lon).toBeCloseTo(mcLon, 6);
    for (const p of ic.points) expect(p.lon).toBeCloseTo(icLon, 6);

    const diff = Math.abs(angularDiff(mcLon, icLon));
    expect(diff).toBeCloseTo(180, 6);
  });

  it('AC line traces the full horizon circle within valid coordinate bounds', () => {
    const lines = computeAstromapLines(jd, ['SUN']);
    const ac = lines.find((l) => l.lineType === 'AC')!;
    expect(ac.points.length).toBeGreaterThan(10);
    for (const p of ac.points) {
      // The horizon circle reaches its apex at lat = 90 − |declination|.
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThan(180);
    }
  });

  it('AC and DC meet at the horizon-circle apexes (shared endpoints)', () => {
    const lines = computeAstromapLines(jd, ['SUN']);
    const ac = lines.find((l) => l.lineType === 'AC')!;
    const dc = lines.find((l) => l.lineType === 'DC')!;
    const acEnds = [ac.points[0], ac.points[ac.points.length - 1]];
    const dcEnds = [dc.points[0], dc.points[dc.points.length - 1]];
    // Each AC endpoint coincides with a DC endpoint (the two apexes).
    for (const a of acEnds) {
      const matched = dcEnds.some(
        (d) => Math.abs(a.lat - d.lat) < 1e-6 && Math.abs(angularDiff(a.lon, d.lon)) < 1e-6,
      );
      expect(matched).toBe(true);
    }
  });

  it('all ten classical planets are supported', () => {
    expect(ASTROMAP_PLANETS).toHaveLength(10);
    const lines = computeAstromapLines(jd, [...ASTROMAP_PLANETS]);
    expect(lines).toHaveLength(40);
  });
});
