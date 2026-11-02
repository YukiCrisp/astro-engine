import { describe, it, expect } from 'vitest';
import { buildJulianDay } from '../../src/utils/date.js';
import { calcSinglePlanet } from '../../src/engine/sweph-adapter.js';
import type { PlanetId } from '../../src/engine/types.js';
import { calculateSolarReturn, calculateLunarReturn, listLunarReturns } from '../../src/engine/index.js';

// Shortest angular separation in degrees (0..180).
function angDist(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

const birth = {
  birthDate: '1986-07-07', birthTime: '05:20', utcOffsetMinutes: 540,
  lat: 35.6762, lon: 139.6503,
  returnLat: 35.6762, returnLon: 139.6503, returnUtcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
  enabledPlanets: ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'] as PlanetId[],
};

// A sidereal return is the body's return to its SIDEREAL natal degree. The
// ayanamsha grows ~50"/yr, so 40 years on the sidereal return comes later than
// the tropical one: ~13 h for the Sun (~1°/day), ~1 h for the Moon (~13°/day).
describe('returns follow the zodiac system', () => {
  it('solar return: the sidereal Sun is back on its sidereal natal degree, ~13 h after the tropical return', () => {
    const tropical = calculateSolarReturn({ ...birth, year: 2026, zodiacSystem: 'tropical' });
    const sidereal = calculateSolarReturn({ ...birth, year: 2026, zodiacSystem: 'sidereal' });
    const natalJd = buildJulianDay(birth.birthDate, birth.birthTime, birth.utcOffsetMinutes);
    const natalSidSun = calcSinglePlanet(natalJd, 'SUN', 'sidereal').longitude;
    const sun = sidereal.planets.find((p) => p.id === 'SUN')!;
    expect(angDist(sun.longitude, natalSidSun)).toBeLessThan(0.001);

    const hoursLater = (sidereal.meta.julianDay - tropical.meta.julianDay) * 24;
    expect(hoursLater).toBeGreaterThan(12);
    expect(hoursLater).toBeLessThan(15);
  });

  it('lunar return and the year list use the sidereal Moon', () => {
    const list = listLunarReturns({ ...birth, year: 2026, zodiacSystem: 'sidereal' }).returns;
    const tropicalList = listLunarReturns({ ...birth, year: 2026, zodiacSystem: 'tropical' }).returns;
    expect(list.length).toBeGreaterThanOrEqual(12);

    const minutesLater = (list[0].julianDay - tropicalList[0].julianDay) * 24 * 60;
    expect(minutesLater).toBeGreaterThan(45);
    expect(minutesLater).toBeLessThan(90);

    const chart = calculateLunarReturn({ ...birth, targetDate: '2026-01-01', zodiacSystem: 'sidereal' });
    expect(Math.abs(chart.meta.julianDay - list[0].julianDay) * 24 * 60).toBeLessThan(1);
  });

  it('tropical stays the default', () => {
    const omitted = listLunarReturns({ ...birth, year: 2026 }).returns;
    const tropical = listLunarReturns({ ...birth, year: 2026, zodiacSystem: 'tropical' }).returns;
    expect(omitted).toEqual(tropical);
  });
});
