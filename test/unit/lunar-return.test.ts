import { describe, it, expect } from 'vitest';
import { buildJulianDay } from '../../src/utils/date.js';
import { calcSinglePlanet } from '../../src/engine/sweph-adapter.js';
import {
  findLunarReturnJD,
  listLunarReturnsInYear,
} from '../../src/engine/calculations/lunar-return.js';

// Shortest angular separation in degrees (0..180).
function angDist(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

const natalJd = buildJulianDay('1986-07-07', '05:20', 540);
const natalMoon = calcSinglePlanet(natalJd, 'MOON').longitude;

describe('findLunarReturnJD', () => {
  it('returns a true conjunction (Moon at the natal longitude, not the opposition)', () => {
    const targetJd = buildJulianDay('2026-01-10', null, 540);
    const jd = findLunarReturnJD(natalMoon, targetJd, 1);
    const moon = calcSinglePlanet(jd, 'MOON').longitude;
    expect(angDist(moon, natalMoon)).toBeLessThan(0.05);
    expect(jd).toBeGreaterThan(targetJd);
  });

  it('finds the NEXT conjunction when the target is just after a return (regression: used to return the opposition ~13d out)', () => {
    const first = findLunarReturnJD(natalMoon, buildJulianDay('2026-01-01', null, 540), 1);
    // One day after a return → the current cycle is past; must find the next
    // conjunction (~27d later), NOT the opposition (~13d, Moon 180° off).
    const next = findLunarReturnJD(natalMoon, first + 1, 1);
    const moon = calcSinglePlanet(next, 'MOON').longitude;
    expect(angDist(moon, natalMoon)).toBeLessThan(0.05);
    expect(next - first).toBeGreaterThan(24);
    expect(next - first).toBeLessThan(31);
  });
});

describe('listLunarReturnsInYear', () => {
  const list = listLunarReturnsInYear(natalMoon, 2026, 540);

  it('lists ~13 returns, all within the year', () => {
    expect(list.length).toBeGreaterThanOrEqual(12);
    expect(list.length).toBeLessThanOrEqual(14);
    for (const r of list) expect(r.datetime.slice(0, 4)).toBe('2026');
  });

  it('every listed moment is a true conjunction, ~27.3 days apart, ascending', () => {
    for (const r of list) {
      const moon = calcSinglePlanet(r.julianDay, 'MOON').longitude;
      expect(angDist(moon, natalMoon)).toBeLessThan(0.05);
    }
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].julianDay - list[i - 1].julianDay;
      expect(gap).toBeGreaterThan(24);
      expect(gap).toBeLessThan(31);
    }
  });
});
