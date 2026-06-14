import { describe, it, expect } from 'vitest';
import {
  AspectGraph,
  detectAspectPatterns,
  averageOrb,
  signElement,
  signModality,
  DEFAULT_PATTERN_CONFIG,
} from '../../src/engine/calculations/aspect-patterns.js';
import type { PlanetPosition, Aspect, AspectType, PlanetId } from '../../src/engine/types.js';

const SIGN_NAMES = ['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS'] as const;

/** Build a minimal planet at a given longitude. Shared helper for detector tests. */
export function makePlanet(id: string, longitude: number): PlanetPosition {
  const sign = Math.floor(longitude / 30) % 12;
  return {
    id: id as PlanetId,
    longitude,
    latitude: 0,
    speed: 1,
    isRetrograde: false,
    sign,
    signName: SIGN_NAMES[sign],
    degree: longitude % 30,
    declination: 0,
  };
}

/** Build an aspect edge between two planets. Shared helper for detector tests. */
export function makeAspect(
  planetA: string,
  planetB: string,
  type: AspectType,
  angle: number,
  orb = 0,
): Aspect {
  return { planetA: planetA as PlanetId, planetB: planetB as PlanetId, type, angle, orb };
}

describe('signElement', () => {
  it('maps signs to their element (cycle of 4)', () => {
    expect(signElement(0)).toBe('FIRE');   // ARI
    expect(signElement(1)).toBe('EARTH');  // TAU
    expect(signElement(2)).toBe('AIR');    // GEM
    expect(signElement(3)).toBe('WATER');  // CAN
    expect(signElement(4)).toBe('FIRE');   // LEO
    expect(signElement(11)).toBe('WATER'); // PIS
  });
});

describe('signModality', () => {
  it('maps signs to their modality (cycle of 3)', () => {
    expect(signModality(0)).toBe('CARDINAL'); // ARI
    expect(signModality(1)).toBe('FIXED');    // TAU
    expect(signModality(2)).toBe('MUTABLE');  // GEM
    expect(signModality(3)).toBe('CARDINAL'); // CAN
    expect(signModality(11)).toBe('MUTABLE'); // PIS
  });
});

describe('averageOrb', () => {
  it('returns 0 for no aspects', () => {
    expect(averageOrb([])).toBe(0);
  });

  it('averages the orbs of the constituent aspects', () => {
    const aspects = [
      makeAspect('SUN', 'MOON', 'TRINE', 120, 1),
      makeAspect('MOON', 'MARS', 'TRINE', 120, 3),
    ];
    expect(averageOrb(aspects)).toBe(2);
  });
});

describe('AspectGraph', () => {
  const planets = [
    makePlanet('SUN', 0),
    makePlanet('MOON', 120),
    makePlanet('MARS', 240),
    makePlanet('VENUS', 60),
  ];
  const aspects = [
    makeAspect('SUN', 'MOON', 'TRINE', 120, 1),
    makeAspect('MOON', 'MARS', 'TRINE', 120, 2),
    makeAspect('SUN', 'VENUS', 'SEXTILE', 60, 0.5),
  ];
  const graph = new AspectGraph(planets, aspects);

  it('resolves a planet position by id', () => {
    expect(graph.position('MARS')?.longitude).toBe(240);
    expect(graph.position('PLUTO')).toBeUndefined();
  });

  it('finds the aspect between two planets regardless of order', () => {
    expect(graph.between('SUN', 'MOON')?.type).toBe('TRINE');
    expect(graph.between('MOON', 'SUN')?.type).toBe('TRINE');
    expect(graph.between('SUN', 'MARS')).toBeUndefined();
  });

  it('reports whether a (typed) aspect exists', () => {
    expect(graph.hasAspect('SUN', 'VENUS')).toBe(true);
    expect(graph.hasAspect('SUN', 'VENUS', 'SEXTILE')).toBe(true);
    expect(graph.hasAspect('SUN', 'VENUS', 'TRINE')).toBe(false);
    expect(graph.hasAspect('MARS', 'VENUS')).toBe(false);
  });

  it('lists neighbors, optionally filtered by aspect type', () => {
    expect(graph.neighbors('SUN').sort()).toEqual(['MOON', 'VENUS']);
    expect(graph.neighbors('SUN', 'TRINE')).toEqual(['MOON']);
    expect(graph.neighbors('MOON', 'TRINE').sort()).toEqual(['MARS', 'SUN']);
    expect(graph.neighbors('PLUTO')).toEqual([]);
  });
});

describe('detectAspectPatterns', () => {
  it('exposes sensible default thresholds', () => {
    expect(DEFAULT_PATTERN_CONFIG.stelliumThreshold).toBe(3);
    expect(DEFAULT_PATTERN_CONFIG.stelliumStrongThreshold).toBe(4);
    expect(DEFAULT_PATTERN_CONFIG.yodQuincunxOrb).toBe(3);
  });

  // Foundation ships with an empty detector registry. Each concrete detector
  // (Grand Trine = ENGA-243, Grand Cross = ENGA-244, T-Square = ENGA-245,
  // Stellium = ENGA-246, Yod = ENGA-247, Kite = ENGA-248) adds its own cases.
  it('returns no patterns until detectors are registered', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240)];
    const aspects = [
      makeAspect('SUN', 'MOON', 'TRINE', 120, 1),
      makeAspect('MOON', 'MARS', 'TRINE', 120, 2),
      makeAspect('SUN', 'MARS', 'TRINE', 120, 1.5),
    ];
    expect(detectAspectPatterns(planets, aspects)).toEqual([]);
  });

  it('accepts a partial config without throwing', () => {
    expect(detectAspectPatterns([], [], { stelliumThreshold: 4 })).toEqual([]);
  });
});
