import { describe, it, expect, beforeAll } from 'vitest';
import { initSweph, calcPlanets, calcHouses } from '../../src/engine/sweph-adapter.js';
import { buildJulianDay } from '../../src/utils/date.js';

// Albert Einstein: born 1879-03-14 11:30 LT, Ulm Germany (48.4011°N, 9.9876°E)
// Local time offset: UTC+0:53:28 ≈ 54 minutes
// Expected: Sun at ~353° (23° Pisces), Moon at ~254° (14° Sagittarius)

beforeAll(() => {
  initSweph('./ephe');
});

describe('Einstein natal chart accuracy', () => {
  const jd = buildJulianDay('1879-03-14', '11:30', 54);

  it('Sun position within 1 degree of expected ~353°', () => {
    const planets = calcPlanets(jd);
    const sun = planets.find(p => p.id === 'SUN')!;
    expect(sun).toBeDefined();
    expect(sun.longitude).toBeGreaterThan(352);
    expect(sun.longitude).toBeLessThan(355);
  });

  it('Moon position within 2 degrees of expected ~254°', () => {
    const planets = calcPlanets(jd);
    const moon = planets.find(p => p.id === 'MOON')!;
    expect(moon).toBeDefined();
    expect(moon.longitude).toBeGreaterThan(252);
    expect(moon.longitude).toBeLessThan(256);
  });

  it('calculates 12 house cusps with Placidus', () => {
    const { houses, angles } = calcHouses(jd, 48.4011, 9.9876, 'PLACIDUS');
    expect(houses).toHaveLength(12);
    expect(angles.asc).toBeGreaterThan(0);
    expect(angles.mc).toBeGreaterThan(0);
    expect(angles.dsc).toBeCloseTo((angles.asc + 180) % 360, 5);
    expect(angles.ic).toBeCloseTo((angles.mc + 180) % 360, 5);
  });

  it('includes Chiron in planet list', () => {
    const planets = calcPlanets(jd);
    const chiron = planets.find(p => p.id === 'CHIRON');
    expect(chiron).toBeDefined();
  });

  it('returns 20 planets (including nodes, liliths, and asteroids)', () => {
    const planets = calcPlanets(jd);
    expect(planets.length).toBe(20);
  });
});
