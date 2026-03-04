import { describe, it, expect } from 'vitest';
import {
  detectChartPattern,
  findCulminatingPlanet,
  findRisingPlanet,
  calculateDistribution,
} from '../../src/engine/calculations/chart-analysis.js';
import type { PlanetPosition, HouseCusp, ChartAngles } from '../../src/engine/types.js';

function makePlanet(id: string, longitude: number): PlanetPosition {
  const sign = Math.floor(longitude / 30);
  return {
    id: id as PlanetPosition['id'],
    longitude,
    latitude: 0,
    speed: 1,
    isRetrograde: false,
    sign,
    signName: (['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS'] as const)[sign],
    degree: longitude % 30,
  };
}

const TEN_PLANET_IDS = ['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'];

function makePlanetsAtLongitudes(longitudes: number[]): PlanetPosition[] {
  return longitudes.map((lon, i) => makePlanet(TEN_PLANET_IDS[i], lon));
}

function makeEqualHouses(ascLon: number): HouseCusp[] {
  return Array.from({ length: 12 }, (_, i) => ({
    house: i + 1,
    longitude: (ascLon + i * 30) % 360,
  }));
}

function makeAngles(asc: number, mc: number): ChartAngles {
  return {
    asc, mc,
    dsc: (asc + 180) % 360,
    ic: (mc + 180) % 360,
    vertex: 0,
    eastPoint: 0,
    partOfFortune: 0,
  };
}

describe('detectChartPattern', () => {
  describe('Bundle', () => {
    it('detects all planets within 120°', () => {
      const planets = makePlanetsAtLongitudes([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('BUNDLE');
      expect(result.span).toBe(90);
    });

    it('detects bundle at exactly 120° span', () => {
      const planets = makePlanetsAtLongitudes([0, 13, 26, 39, 52, 65, 78, 91, 104, 120]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('BUNDLE');
      expect(result.span).toBe(120);
    });

    it('rejects bundle at 121° span', () => {
      const planets = makePlanetsAtLongitudes([0, 13, 26, 39, 52, 65, 78, 91, 104, 121]);
      const result = detectChartPattern(planets);
      expect(result.type).not.toBe('BUNDLE');
    });

    it('handles wrap-around (e.g. 350° to 50°)', () => {
      const planets = makePlanetsAtLongitudes([350, 355, 0, 5, 10, 15, 20, 25, 30, 50]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('BUNDLE');
      expect(result.span).toBe(60);
    });
  });

  describe('Bucket', () => {
    it('detects bucket: 9 planets within 180°, 1 handle 60°+ away', () => {
      // 9 planets clustered 0-160°, handle at 300° (140° from nearest at 160°)
      const planets = makePlanetsAtLongitudes([0, 20, 40, 60, 80, 100, 120, 140, 160, 300]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('BUCKET');
      expect(result.handlePlanet).toBe('PLUTO'); // index 9
    });

    it('rejects bucket when handle is less than 60° from nearest', () => {
      // 9 planets 0-160°, "handle" at 210° (50° from 160°)
      const planets = makePlanetsAtLongitudes([0, 20, 40, 60, 80, 100, 120, 140, 160, 210]);
      const result = detectChartPattern(planets);
      expect(result.type).not.toBe('BUCKET');
    });

    it('detects bucket handle at exactly 60° boundary', () => {
      // 9 planets 0-160°, handle at 220° (exactly 60° from 160°)
      const planets = makePlanetsAtLongitudes([0, 20, 40, 60, 80, 100, 120, 140, 160, 220]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('BUCKET');
    });
  });

  describe('Bowl', () => {
    it('detects all planets within 180° (but not bundle)', () => {
      const planets = makePlanetsAtLongitudes([0, 20, 40, 60, 80, 100, 120, 140, 160, 170]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('BOWL');
      expect(result.span).toBe(170);
    });

    it('detects bowl at exactly 180° span', () => {
      const planets = makePlanetsAtLongitudes([0, 20, 40, 60, 80, 100, 120, 140, 160, 180]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('BOWL');
      expect(result.span).toBe(180);
    });

    it('rejects bowl at 181° span (no bucket match)', () => {
      // All 10 spread across 181° — not a bowl, and no single planet qualifies as handle
      const planets = makePlanetsAtLongitudes([0, 20, 40, 60, 80, 100, 120, 140, 160, 181]);
      const result = detectChartPattern(planets);
      expect(result.type).not.toBe('BOWL');
    });
  });

  describe('Seesaw', () => {
    it('detects two groups with two 60°+ gaps', () => {
      // Group A: 0-40°, Group B: 180-220° — gaps at ~140° and ~140°
      const planets = makePlanetsAtLongitudes([0, 10, 20, 30, 40, 180, 190, 200, 210, 220]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('SEESAW');
    });

    it('rejects seesaw with only 1 gap >= 60°', () => {
      // Planets spread fairly evenly — not seesaw
      const planets = makePlanetsAtLongitudes([0, 30, 60, 90, 120, 150, 200, 230, 260, 290]);
      const result = detectChartPattern(planets);
      expect(result.type).not.toBe('SEESAW');
    });
  });

  describe('Locomotive', () => {
    it('detects planets within 240° with 120°+ gap', () => {
      // Planets from 0° to 230°, gap from 230° to 360° = 130°
      const planets = makePlanetsAtLongitudes([0, 25, 50, 75, 100, 125, 150, 175, 200, 230]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('LOCOMOTIVE');
    });

    it('detects locomotive at exactly 240° span', () => {
      const planets = makePlanetsAtLongitudes([0, 26, 52, 78, 104, 130, 156, 182, 208, 240]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('LOCOMOTIVE');
    });
  });

  describe('Splash', () => {
    it('detects planets in 7+ different signs', () => {
      // Each planet in a different sign (30° apart), 10 signs occupied
      const planets = makePlanetsAtLongitudes([5, 35, 65, 95, 125, 155, 185, 215, 245, 275]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('SPLASH');
      expect(result.occupiedSigns).toBe(10);
    });

    it('detects splash at exactly 7 signs', () => {
      // 7 signs occupied, spread enough that maxGap < 120° and no seesaw
      const planets = makePlanetsAtLongitudes([5, 6, 7, 35, 95, 155, 185, 215, 275, 276]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('SPLASH');
      expect(result.occupiedSigns).toBe(7);
    });
  });

  describe('Splay', () => {
    it('falls through to splay when no other pattern matches', () => {
      // 6 signs, span > 240°, maxGap < 120°, 3 gaps >= 60° (not seesaw) — splay
      const planets = makePlanetsAtLongitudes([0, 10, 80, 90, 170, 175, 240, 250, 300, 310]);
      const result = detectChartPattern(planets);
      expect(result.type).toBe('SPLAY');
    });
  });

  it('counts occupied signs correctly', () => {
    // All in Aries (0-30°)
    const planets = makePlanetsAtLongitudes([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
    const result = detectChartPattern(planets);
    expect(result.occupiedSigns).toBe(1);
  });

  it('ignores non-major planets', () => {
    // 10 major planets in bundle range + extra non-major planets elsewhere
    const planets = [
      ...makePlanetsAtLongitudes([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]),
      makePlanet('TRUE_NODE', 250),
      makePlanet('CHIRON', 300),
    ];
    const result = detectChartPattern(planets);
    expect(result.type).toBe('BUNDLE');
  });
});

describe('findCulminatingPlanet', () => {
  it('finds planet closest to MC within 10° orb', () => {
    const planets = [makePlanet('SUN', 100), makePlanet('MARS', 185), makePlanet('VENUS', 179)];
    const angles = makeAngles(0, 180);
    expect(findCulminatingPlanet(planets, angles)).toBe('VENUS');
  });

  it('returns null when no planet within 10° of MC', () => {
    const planets = [makePlanet('SUN', 100), makePlanet('MARS', 200)];
    const angles = makeAngles(0, 180);
    expect(findCulminatingPlanet(planets, angles)).toBeNull();
  });

  it('handles wrap-around near 0°/360°', () => {
    const planets = [makePlanet('SUN', 355)];
    const angles = makeAngles(90, 2);
    expect(findCulminatingPlanet(planets, angles)).toBe('SUN'); // 7° away
  });

  it('picks closest when multiple planets near MC', () => {
    const planets = [makePlanet('SUN', 178), makePlanet('MOON', 181)];
    const angles = makeAngles(0, 180);
    expect(findCulminatingPlanet(planets, angles)).toBe('MOON'); // 1° vs 2°
  });

  it('ignores non-major planets', () => {
    const planets = [makePlanet('CHIRON', 180)];
    const angles = makeAngles(0, 180);
    expect(findCulminatingPlanet(planets, angles)).toBeNull();
  });
});

describe('findRisingPlanet', () => {
  it('finds planet in 1st house closest to ASC', () => {
    const houses = makeEqualHouses(0);
    const angles = makeAngles(0, 270);
    const planets = [makePlanet('SUN', 5), makePlanet('MOON', 20)];
    expect(findRisingPlanet(planets, houses, angles)).toBe('SUN');
  });

  it('returns null when no planet in 1st house', () => {
    const houses = makeEqualHouses(0);
    const angles = makeAngles(0, 270);
    const planets = [makePlanet('SUN', 45), makePlanet('MOON', 100)];
    expect(findRisingPlanet(planets, houses, angles)).toBeNull();
  });

  it('ignores non-major planets in 1st house', () => {
    const houses = makeEqualHouses(0);
    const angles = makeAngles(0, 270);
    const planets = [makePlanet('CHIRON', 5)];
    expect(findRisingPlanet(planets, houses, angles)).toBeNull();
  });
});

describe('calculateDistribution', () => {
  it('assigns elements correctly', () => {
    const planets = [
      makePlanet('SUN', 5),     // ARI = FIRE
      makePlanet('MOON', 35),   // TAU = EARTH
      makePlanet('MERCURY', 65), // GEM = AIR
      makePlanet('VENUS', 95),  // CAN = WATER
    ];
    const dist = calculateDistribution(planets, null);
    expect(dist.elements.FIRE).toEqual(['SUN']);
    expect(dist.elements.EARTH).toEqual(['MOON']);
    expect(dist.elements.AIR).toEqual(['MERCURY']);
    expect(dist.elements.WATER).toEqual(['VENUS']);
  });

  it('assigns modalities correctly', () => {
    const planets = [
      makePlanet('SUN', 5),     // ARI = CARDINAL
      makePlanet('MOON', 35),   // TAU = FIXED
      makePlanet('MERCURY', 65), // GEM = MUTABLE
    ];
    const dist = calculateDistribution(planets, null);
    expect(dist.modalities.CARDINAL).toEqual(['SUN']);
    expect(dist.modalities.FIXED).toEqual(['MOON']);
    expect(dist.modalities.MUTABLE).toEqual(['MERCURY']);
  });

  it('assigns polarities correctly', () => {
    const planets = [
      makePlanet('SUN', 5),    // ARI = MASCULINE
      makePlanet('MOON', 35),  // TAU = FEMININE
    ];
    const dist = calculateDistribution(planets, null);
    expect(dist.polarities.MASCULINE).toEqual(['SUN']);
    expect(dist.polarities.FEMININE).toEqual(['MOON']);
  });

  it('assigns quadrants when houses provided', () => {
    const houses = makeEqualHouses(0);
    const planets = [
      makePlanet('SUN', 5),    // house 1 = ANGULAR
      makePlanet('MOON', 35),  // house 2 = SUCCEDENT
      makePlanet('MERCURY', 65), // house 3 = CADENT
    ];
    const dist = calculateDistribution(planets, houses);
    expect(dist.quadrants.ANGULAR).toEqual(['SUN']);
    expect(dist.quadrants.SUCCEDENT).toEqual(['MOON']);
    expect(dist.quadrants.CADENT).toEqual(['MERCURY']);
  });

  it('returns empty quadrants when houses null', () => {
    const planets = [makePlanet('SUN', 5)];
    const dist = calculateDistribution(planets, null);
    expect(dist.quadrants.ANGULAR).toEqual([]);
    expect(dist.quadrants.SUCCEDENT).toEqual([]);
    expect(dist.quadrants.CADENT).toEqual([]);
  });

  it('ignores non-major planets', () => {
    const planets = [makePlanet('CHIRON', 5)];
    const dist = calculateDistribution(planets, null);
    expect(dist.elements.FIRE).toEqual([]);
  });
});
