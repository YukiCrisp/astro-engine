import { beforeAll, describe, expect, it } from 'vitest';
import { calculateComposite, calculateNatal } from '../../src/engine/index.js';
import { midpointLongitude } from '../../src/engine/calculations/composite.js';
import { initSweph } from '../../src/engine/sweph-adapter.js';
import type { HouseCusp } from '../../src/engine/types.js';

beforeAll(() => {
  initSweph('./ephe');
});

const personA = {
  birthDate: '1990-04-15', birthTime: '14:30',
  lat: 35.6762, lon: 139.6503, utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};
const personB = {
  birthDate: '1988-11-02', birthTime: '08:15',
  lat: 34.6937, lon: 135.5023, utcOffsetMinutes: 540,
  houseSystem: 'PLACIDUS' as const,
};

const normalize360 = (longitude: number): number => ((longitude % 360) + 360) % 360;

function expectOrderedCusps(houses: HouseCusp[]): void {
  expect(houses).toHaveLength(12);
  const gaps = houses.map((house, i) =>
    normalize360(houses[(i + 1) % 12].longitude - house.longitude));
  for (const gap of gaps) expect(gap).toBeGreaterThan(0);
  expect(gaps.reduce((sum, gap) => sum + gap, 0)).toBeCloseTo(360, 6);
}

describe('calculateComposite houses', () => {
  it('uses ordered Placidus cusps with ASC and MC on their house lines', () => {
    const natalA = calculateNatal(personA);
    const natalB = calculateNatal(personB);
    const chart = calculateComposite({ personA, personB });
    expect(chart.meta.houseSystem).toBe('PLACIDUS');
    expect(chart.houses![0].longitude).toBeCloseTo(chart.angles!.asc, 6);
    expect(chart.houses![9].longitude).toBeCloseTo(chart.angles!.mc, 6);
    expect(chart.angles!.mc).toBeCloseTo(midpointLongitude(natalA.angles!.mc, natalB.angles!.mc), 6);
    chart.houses!.forEach((house, i) => {
      const offsetA = normalize360(natalA.houses![i].longitude - natalA.angles!.asc);
      const offsetB = normalize360(natalB.houses![i].longitude - natalB.angles!.asc);
      expect(house.longitude).toBeCloseTo(normalize360(chart.angles!.asc + (offsetA + offsetB) / 2), 6);
    });
    expectOrderedCusps(chart.houses!);
  });

  it('keeps the MC on cusp 10 when the natal MC midpoint flips sides', () => {
    const north = {
      birthDate: '1990-04-15', birthTime: '14:30',
      lat: 55.75, lon: 37.62, utcOffsetMinutes: 180,
      houseSystem: 'PLACIDUS' as const,
    };
    const south = {
      birthDate: '1988-11-02', birthTime: '13:15',
      lat: -20, lon: 151.2, utcOffsetMinutes: 600,
      houseSystem: 'PLACIDUS' as const,
    };
    const natalA = calculateNatal(north);
    const natalB = calculateNatal(south);
    const chart = calculateComposite({ personA: north, personB: south });
    const natalMcMidpoint = midpointLongitude(natalA.angles!.mc, natalB.angles!.mc);

    expect(normalize360(chart.houses![9].longitude - natalMcMidpoint)).toBeCloseTo(180, 6);
    expect(chart.houses![0].longitude).toBeCloseTo(chart.angles!.asc, 6);
    expect(chart.houses![9].longitude).toBeCloseTo(chart.angles!.mc, 6);
    expect(chart.angles!.ic).toBeCloseTo(normalize360(chart.angles!.mc + 180), 6);
    expectOrderedCusps(chart.houses!);
  });

  it('keeps Regiomontanus cusps ordered across widely separated latitudes', () => {
    const north = {
      birthDate: '1990-04-15', birthTime: '14:30',
      lat: 64.1, lon: -21.9, utcOffsetMinutes: 0,
      houseSystem: 'REGIOMONTANUS' as const,
    };
    const south = {
      birthDate: '1988-11-02', birthTime: '08:15',
      lat: -43.5, lon: 172.6, utcOffsetMinutes: 720,
      houseSystem: 'REGIOMONTANUS' as const,
    };
    const natalA = calculateNatal(north);
    const natalB = calculateNatal(south);
    const chart = calculateComposite({ personA: north, personB: south });

    expect(normalize360(natalB.houses![1].longitude - natalA.houses![1].longitude)).toBeGreaterThan(100);
    expect(chart.houses![0].longitude).toBeCloseTo(chart.angles!.asc, 6);
    expect(chart.houses![9].longitude).toBeCloseTo(chart.angles!.mc, 6);
    expectOrderedCusps(chart.houses!);
  });

  it('starts Whole Sign houses at the beginning of the composite ASC sign', () => {
    const natalA = calculateNatal({ ...personA, houseSystem: 'WHOLE_SIGN' });
    const natalB = calculateNatal({ ...personB, houseSystem: 'WHOLE_SIGN' });
    const chart = calculateComposite({
      personA: { ...personA, houseSystem: 'WHOLE_SIGN' },
      personB: { ...personB, houseSystem: 'WHOLE_SIGN' },
    });
    const firstCusp = Math.floor(chart.angles!.asc / 30) * 30;
    expect(chart.meta.houseSystem).toBe('WHOLE_SIGN');
    expect(chart.angles!.mc).toBeCloseTo(midpointLongitude(natalA.angles!.mc, natalB.angles!.mc), 6);
    chart.houses!.forEach((house, i) => {
      expect(house.longitude).toBeCloseTo(normalize360(firstCusp + i * 30), 6);
    });
  });

  it('keeps Equal houses at 30 degree intervals from the composite ASC', () => {
    const natalA = calculateNatal({ ...personA, houseSystem: 'EQUAL' });
    const natalB = calculateNatal({ ...personB, houseSystem: 'EQUAL' });
    const chart = calculateComposite({
      personA: { ...personA, houseSystem: 'EQUAL' },
      personB: { ...personB, houseSystem: 'EQUAL' },
    });
    expect(chart.meta.houseSystem).toBe('EQUAL');
    expect(chart.angles!.mc).toBeCloseTo(midpointLongitude(natalA.angles!.mc, natalB.angles!.mc), 6);
    chart.houses!.forEach((house, i) => {
      expect(house.longitude).toBeCloseTo((chart.angles!.asc + i * 30) % 360, 6);
    });
  });

  it('uses person A house system for both natal source charts', () => {
    const mixed = calculateComposite({
      personA,
      personB: { ...personB, houseSystem: 'WHOLE_SIGN' },
    });
    const placidus = calculateComposite({ personA, personB });
    expect(mixed.meta.houseSystem).toBe('PLACIDUS');
    mixed.houses!.forEach((house, i) => {
      expect(house.longitude).toBeCloseTo(placidus.houses![i].longitude, 6);
    });
  });

  it('uses person A sidereal zodiac for both natal source charts', () => {
    const siderealA = { ...personA, zodiacSystem: 'sidereal' as const };
    const mixed = calculateComposite({ personA: siderealA, personB });
    const bothSidereal = calculateComposite({
      personA: siderealA,
      personB: { ...personB, zodiacSystem: 'sidereal' },
    });
    expect(mixed.meta.zodiacSystem).toBe('sidereal');
    mixed.houses!.forEach((house, i) => {
      expect(house.longitude).toBeCloseTo(bothSidereal.houses![i].longitude, 6);
    });
    mixed.planets.forEach((planet, i) => {
      expect(planet.longitude).toBeCloseTo(bothSidereal.planets[i].longitude, 6);
    });
  });

  it('marks a missing birth time and still returns ordered cusps', () => {
    const chart = calculateComposite({
      personA,
      personB: { ...personB, birthTime: null },
    });
    expect(chart.meta.birthTimeAssumed).toBe(true);
    expectOrderedCusps(chart.houses!);
  });
});
