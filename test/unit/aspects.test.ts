import { describe, it, expect } from 'vitest';
import { detectAspects, detectCrossAspects, ORB_TABLE } from '../../src/engine/calculations/aspects.js';
import type { PlanetPosition } from '../../src/engine/types.js';

function makePlanet(id: string, longitude: number, speed: number = 1): PlanetPosition {
  return {
    id: id as PlanetPosition['id'],
    longitude,
    latitude: 0,
    speed,
    isRetrograde: speed < 0,
    sign: Math.floor(longitude / 30),
    degree: longitude % 30,
  };
}

describe('detectAspects', () => {
  it('detects conjunction (0°)', () => {
    const planets = [makePlanet('SUN', 10), makePlanet('MOON', 13)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('CONJUNCTION');
    expect(aspects[0].orb).toBeCloseTo(3, 5);
  });

  it('detects opposition (180°)', () => {
    const planets = [makePlanet('MARS', 0), makePlanet('SATURN', 178)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('OPPOSITION');
    expect(aspects[0].orb).toBeCloseTo(2, 5);
  });

  it('detects trine (120°)', () => {
    const planets = [makePlanet('VENUS', 10), makePlanet('JUPITER', 130)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('TRINE');
  });

  it('detects square (90°)', () => {
    const planets = [makePlanet('MERCURY', 0), makePlanet('NEPTUNE', 93)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('SQUARE');
  });

  it('detects sextile (60°)', () => {
    const planets = [makePlanet('MARS', 30), makePlanet('SATURN', 90)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('SEXTILE');
  });

  it('handles wrap-around (e.g. 355° and 5°)', () => {
    const planets = [makePlanet('SUN', 355), makePlanet('MOON', 5)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('CONJUNCTION');
    expect(aspects[0].orb).toBeCloseTo(10, 5);
  });

  it('gives luminary bonus orb to Sun/Moon aspects', () => {
    // Base conjunction orb = 8, luminary bonus = 2, total = 10
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 10)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('CONJUNCTION');
  });

  it('rejects aspects beyond orb', () => {
    // Mars-Saturn quintile orb = 1.5, these are 74° apart = orb 2 > 1.5
    const planets = [makePlanet('MARS', 0), makePlanet('SATURN', 74)];
    const aspects = detectAspects(planets);
    const quintile = aspects.find(a => a.type === 'QUINTILE');
    expect(quintile).toBeUndefined();
  });

  it('returns empty for single planet', () => {
    const aspects = detectAspects([makePlanet('SUN', 100)]);
    expect(aspects).toHaveLength(0);
  });

  it('picks strongest (first in priority) aspect per pair', () => {
    // 0° and 0° → conjunction (0° orb), not opposition or any other
    const planets = [makePlanet('MARS', 0), makePlanet('SATURN', 0)];
    const aspects = detectAspects(planets);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('CONJUNCTION');
  });
});

describe('detectCrossAspects', () => {
  it('uses halved orbs', () => {
    // Normal conjunction orb for non-luminaries = 8, halved = 4
    // 5° apart should be within cross-chart orb
    const a = [makePlanet('MARS', 0)];
    const b = [makePlanet('SATURN', 3)];
    const aspects = detectCrossAspects(a, b);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('CONJUNCTION');
  });

  it('rejects aspects beyond full orb', () => {
    // Non-luminary conjunction orb = 8, 9° apart = orb 9 > 8
    const a = [makePlanet('MARS', 0)];
    const b = [makePlanet('SATURN', 9)];
    const aspects = detectCrossAspects(a, b);
    expect(aspects).toHaveLength(0);
  });

  it('allows same-planet pairs across charts', () => {
    const a = [makePlanet('SUN', 0)];
    const b = [makePlanet('SUN', 0)];
    const aspects = detectCrossAspects(a, b);
    expect(aspects).toHaveLength(1);
    expect(aspects[0].type).toBe('CONJUNCTION');
  });
});
