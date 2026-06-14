import { describe, it, expect } from 'vitest';
import {
  AspectGraph,
  detectAspectPatterns,
  detectTSquares,
  averageOrb,
  signElement,
  signModality,
  DEFAULT_PATTERN_CONFIG,
} from '../../src/engine/calculations/aspect-patterns.js';
import { detectAspects } from '../../src/engine/calculations/aspects.js';
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

  // Concrete detectors register themselves into the foundation registry
  // (Grand Trine = ENGA-243, Grand Cross = ENGA-244, T-Square = ENGA-245,
  // Stellium = ENGA-246, Yod = ENGA-247, Kite = ENGA-248). A grand-trine
  // geometry (three trines, no opposition/square) hosts no T-square or Yod, and
  // with the planets spread across distinct signs and no shared house it forms
  // no stellium either, so the pipeline surfaces nothing for it.
  it('surfaces no pattern for a grand-trine geometry', () => {
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

  it('detects a cardinal T-square through the full pipeline', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 180), makePlanet('MARS', 90)];
    const aspects = [
      makeAspect('SUN', 'MOON', 'OPPOSITION', 180, 1),
      makeAspect('SUN', 'MARS', 'SQUARE', 90, 2),
      makeAspect('MOON', 'MARS', 'SQUARE', 90, 3),
    ];
    expect(detectAspectPatterns(planets, aspects)).toEqual([
      { type: 'T_SQUARE', planets: ['MOON', 'SUN', 'MARS'], apex: 'MARS', modality: 'CARDINAL', orbAvg: 2 },
    ]);
  });
});

describe('detectTSquares', () => {
  // A clean cardinal T-square: SUN(ARI 0°) opp MOON(LIB 180°), both square
  // the apex MARS(CAN 90°). Apex is the focal planet; modality follows it.
  const cardinal = () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 180), makePlanet('MARS', 90)];
    const aspects = [
      makeAspect('SUN', 'MOON', 'OPPOSITION', 180, 1),
      makeAspect('SUN', 'MARS', 'SQUARE', 90, 2),
      makeAspect('MOON', 'MARS', 'SQUARE', 90, 3),
    ];
    return new AspectGraph(planets, aspects);
  };

  it('identifies the opposition ends, the apex, and the orb average', () => {
    const [pattern, ...rest] = detectTSquares(cardinal());
    expect(rest).toEqual([]);
    expect(pattern.type).toBe('T_SQUARE');
    expect(pattern.apex).toBe('MARS');
    expect(pattern.planets).toEqual(['MOON', 'SUN', 'MARS']); // opposition ends sorted, apex last
    expect(pattern.orbAvg).toBeCloseTo((1 + 2 + 3) / 3);
  });

  it('labels modality from the apex sign — fixed', () => {
    // TAU(30°) opp SCO(210°), apex LEO(120°) squares both. LEO is fixed.
    const planets = [makePlanet('VENUS', 30), makePlanet('MARS', 210), makePlanet('SATURN', 120)];
    const aspects = [
      makeAspect('VENUS', 'MARS', 'OPPOSITION', 180, 0),
      makeAspect('VENUS', 'SATURN', 'SQUARE', 90, 1),
      makeAspect('MARS', 'SATURN', 'SQUARE', 90, 1),
    ];
    const [pattern] = detectTSquares(new AspectGraph(planets, aspects));
    expect(pattern.apex).toBe('SATURN');
    expect(pattern.modality).toBe('FIXED');
  });

  it('labels modality from the apex sign — mutable', () => {
    // GEM(60°) opp SAG(240°), apex VIR(150°) squares both. VIR is mutable.
    const planets = [makePlanet('MERCURY', 60), makePlanet('JUPITER', 240), makePlanet('NEPTUNE', 150)];
    const aspects = [
      makeAspect('MERCURY', 'JUPITER', 'OPPOSITION', 180, 0),
      makeAspect('MERCURY', 'NEPTUNE', 'SQUARE', 90, 2),
      makeAspect('JUPITER', 'NEPTUNE', 'SQUARE', 90, 2),
    ];
    const [pattern] = detectTSquares(new AspectGraph(planets, aspects));
    expect(pattern.modality).toBe('MUTABLE');
  });

  it('requires the apex to square BOTH ends, not just one', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 180), makePlanet('MARS', 90)];
    const aspects = [
      makeAspect('SUN', 'MOON', 'OPPOSITION', 180, 1),
      makeAspect('SUN', 'MARS', 'SQUARE', 90, 2), // MARS squares SUN but not MOON
    ];
    expect(detectTSquares(new AspectGraph(planets, aspects))).toEqual([]);
  });

  it('emits one T-square per apex sharing the same opposition', () => {
    // Two apices (MARS at 90°, SATURN at 270°) both square the SUN–MOON axis.
    const planets = [
      makePlanet('SUN', 0), makePlanet('MOON', 180),
      makePlanet('MARS', 90), makePlanet('SATURN', 270),
    ];
    const aspects = [
      makeAspect('SUN', 'MOON', 'OPPOSITION', 180, 1),
      makeAspect('SUN', 'MARS', 'SQUARE', 90, 0),
      makeAspect('MOON', 'MARS', 'SQUARE', 90, 0),
      makeAspect('SUN', 'SATURN', 'SQUARE', 90, 0),
      makeAspect('MOON', 'SATURN', 'SQUARE', 90, 0),
    ];
    const apices = detectTSquares(new AspectGraph(planets, aspects)).map((p) => p.apex).sort();
    expect(apices).toEqual(['MARS', 'SATURN']);
  });

  it('returns nothing without an opposition backbone', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MARS', 90), makePlanet('SATURN', 180)];
    const aspects = [
      makeAspect('SUN', 'MARS', 'SQUARE', 90, 1),
      makeAspect('MARS', 'SATURN', 'SQUARE', 90, 1),
    ];
    expect(detectTSquares(new AspectGraph(planets, aspects))).toEqual([]);
  });
});

describe('YOD detector (ENGA-247)', () => {
  // Canonical Yod: SUN(0°) sextile VENUS(60°); both quincunx the apex MARS(210°).
  //   |210-0|   = 150  → quincunx leg A
  //   |210-60|  = 150  → quincunx leg B
  //   |60-0|    = 60   → sextile base
  const yodPlanets = [makePlanet('SUN', 0), makePlanet('VENUS', 60), makePlanet('MARS', 210)];
  const yodAspects = [
    makeAspect('SUN', 'VENUS', 'SEXTILE', 60, 0.5),
    makeAspect('SUN', 'MARS', 'QUINCUNX', 150, 1),
    makeAspect('VENUS', 'MARS', 'QUINCUNX', 150, 2),
  ];

  it('detects a Yod from a sextile base with two quincunx legs to a common apex', () => {
    const patterns = detectAspectPatterns(yodPlanets, yodAspects);
    expect(patterns).toHaveLength(1);
    const yod = patterns[0];
    expect(yod.type).toBe('YOD');
    expect(yod.apex).toBe('MARS');
    // base pair sorted, apex last
    expect(yod.planets).toEqual(['SUN', 'VENUS', 'MARS']);
    // average orb across sextile + both quincunx legs: (0.5 + 1 + 2) / 3
    expect(yod.orbAvg).toBeCloseTo(1.1667, 3);
  });

  it('requires a real sextile base — two quincunxes alone are not a Yod', () => {
    const aspects = [
      // no SUN-VENUS sextile; the base pair is unconnected
      makeAspect('SUN', 'MARS', 'QUINCUNX', 150, 1),
      makeAspect('VENUS', 'MARS', 'QUINCUNX', 150, 1),
    ];
    expect(detectAspectPatterns(yodPlanets, aspects)).toEqual([]);
  });

  it('rejects a leg whose quincunx orb exceeds the dedicated yodQuincunxOrb', () => {
    const aspects = [
      makeAspect('SUN', 'VENUS', 'SEXTILE', 60, 0.5),
      makeAspect('SUN', 'MARS', 'QUINCUNX', 150, 1),
      // leg wider than the default 3° dedicated quincunx orb
      makeAspect('VENUS', 'MARS', 'QUINCUNX', 150, 3.5),
    ];
    expect(detectAspectPatterns(yodPlanets, aspects)).toEqual([]);
  });

  it('honours a tightened yodQuincunxOrb from config', () => {
    const aspects = [
      makeAspect('SUN', 'VENUS', 'SEXTILE', 60, 0.5),
      makeAspect('SUN', 'MARS', 'QUINCUNX', 150, 2.5),
      makeAspect('VENUS', 'MARS', 'QUINCUNX', 150, 1),
    ];
    // default orb (3) → detected; tightened to 2 → leg at 2.5 rejected
    expect(detectAspectPatterns(yodPlanets, aspects)).toHaveLength(1);
    expect(detectAspectPatterns(yodPlanets, aspects, { yodQuincunxOrb: 2 })).toEqual([]);
  });

  it('does not constrain the sextile base by the quincunx orb (wide sextile still valid)', () => {
    const aspects = [
      // sextile orb 4.5° — wider than yodQuincunxOrb but within a normal sextile orb
      makeAspect('SUN', 'VENUS', 'SEXTILE', 60, 4.5),
      makeAspect('SUN', 'MARS', 'QUINCUNX', 150, 1),
      makeAspect('VENUS', 'MARS', 'QUINCUNX', 150, 1),
    ];
    expect(detectAspectPatterns(yodPlanets, aspects)).toHaveLength(1);
  });

  it('finds two distinct apexes sharing the same sextile base', () => {
    // SUN(0) sextile VENUS(60); apexes MARS(210) and also a second body at 210°-ish
    // Use MARS(210) and SATURN(210) both quincunx to the base → two Yods.
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('VENUS', 60),
      makePlanet('MARS', 210),
      makePlanet('SATURN', 211),
    ];
    const aspects = [
      makeAspect('SUN', 'VENUS', 'SEXTILE', 60, 0.5),
      makeAspect('SUN', 'MARS', 'QUINCUNX', 150, 1),
      makeAspect('VENUS', 'MARS', 'QUINCUNX', 150, 1),
      makeAspect('SUN', 'SATURN', 'QUINCUNX', 150, 1),
      makeAspect('VENUS', 'SATURN', 'QUINCUNX', 150, 2),
    ];
    const patterns = detectAspectPatterns(planets, aspects);
    expect(patterns).toHaveLength(2);
    expect(patterns.map((p) => p.apex).sort()).toEqual(['MARS', 'SATURN']);
  });

  it('end-to-end: detects a Yod from detectAspects output on real longitudes', () => {
    // MERCURY(0) sextile MARS(60); JUPITER(210) quincunx both. No luminaries
    // so no orb bonus muddies the legs.
    const planets = [makePlanet('MERCURY', 0), makePlanet('MARS', 60), makePlanet('JUPITER', 210)];
    const aspects = detectAspects(planets);
    const patterns = detectAspectPatterns(planets, aspects);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('YOD');
    expect(patterns[0].apex).toBe('JUPITER');
  });
});

/** Twelve equal (whole-sign-aligned) house cusps: house N spans sign N-1. */
function equalHouses(): { house: number; longitude: number }[] {
  return Array.from({ length: 12 }, (_, i) => ({ house: i + 1, longitude: i * 30 }));
}

describe('detectStelliums', () => {
  it('detects a same-sign cluster at the default threshold (3)', () => {
    // Three planets all in Aries (sign 0), no house data.
    const planets = [makePlanet('SUN', 1), makePlanet('MERCURY', 28), makePlanet('VENUS', 15)];
    const patterns = detectAspectPatterns(planets, []);
    expect(patterns).toHaveLength(1);
    const [s] = patterns;
    expect(s.type).toBe('STELLIUM');
    expect(s.sign).toBe(0);
    expect(s.element).toBe('FIRE');
    expect(s.modality).toBe('CARDINAL');
    expect(s.house).toBeUndefined();
    expect(s.strong).toBe(false);
    // Planets are ordered by longitude.
    expect(s.planets).toEqual(['SUN', 'VENUS', 'MERCURY']);
  });

  it('does not flag a 2-planet cluster', () => {
    const planets = [makePlanet('SUN', 1), makePlanet('VENUS', 15)];
    expect(detectAspectPatterns(planets, [])).toEqual([]);
  });

  it('marks clusters of 4+ as strong', () => {
    const planets = [
      makePlanet('SUN', 1),
      makePlanet('VENUS', 8),
      makePlanet('MERCURY', 15),
      makePlanet('MARS', 25),
    ];
    const [s] = detectAspectPatterns(planets, []);
    expect(s.planets).toHaveLength(4);
    expect(s.strong).toBe(true);
  });

  it('honors a 3/4 threshold switch via config', () => {
    const planets = [makePlanet('SUN', 1), makePlanet('VENUS', 15), makePlanet('MERCURY', 28)];
    // Default threshold 3 → detected.
    expect(detectAspectPatterns(planets, [])).toHaveLength(1);
    // Threshold raised to 4 → the same three planets no longer qualify.
    expect(detectAspectPatterns(planets, [], { stelliumThreshold: 4 })).toEqual([]);
  });

  it('averages conjunction orbs of cluster members (0 when none conjunct)', () => {
    const planets = [makePlanet('SUN', 1), makePlanet('VENUS', 5), makePlanet('MERCURY', 9)];
    const aspects = [
      makeAspect('SUN', 'VENUS', 'CONJUNCTION', 0, 2),
      makeAspect('VENUS', 'MERCURY', 'CONJUNCTION', 0, 4),
    ];
    const [withConj] = detectAspectPatterns(planets, aspects);
    expect(withConj.orbAvg).toBe(3);
    // No aspects supplied → no constituent conjunctions → 0.
    const [noConj] = detectAspectPatterns(planets, []);
    expect(noConj.orbAvg).toBe(0);
  });

  it('detects a same-house cluster spanning different signs', () => {
    // House 1 spans 0°–90° (signs Aries/Taurus/Gemini); planets in three signs.
    const houses = [
      { house: 1, longitude: 0 }, { house: 2, longitude: 90 }, { house: 3, longitude: 100 },
      { house: 4, longitude: 130 }, { house: 5, longitude: 160 }, { house: 6, longitude: 190 },
      { house: 7, longitude: 220 }, { house: 8, longitude: 250 }, { house: 9, longitude: 280 },
      { house: 10, longitude: 310 }, { house: 11, longitude: 330 }, { house: 12, longitude: 350 },
    ];
    const planets = [makePlanet('SUN', 10), makePlanet('VENUS', 40), makePlanet('MARS', 70)];
    const [s] = detectAspectPatterns(planets, [], {}, houses);
    expect(s.type).toBe('STELLIUM');
    expect(s.house).toBe(1);
    expect(s.sign).toBeUndefined();
    expect(s.element).toBeUndefined();
    expect(s.modality).toBeUndefined();
  });

  it('merges a same-sign and same-house cluster into one pattern', () => {
    // Three planets in Aries, all in house 1 (equal houses) → single pattern.
    const planets = [makePlanet('SUN', 5), makePlanet('VENUS', 15), makePlanet('MERCURY', 25)];
    const patterns = detectAspectPatterns(planets, [], {}, equalHouses());
    expect(patterns).toHaveLength(1);
    const [s] = patterns;
    expect(s.sign).toBe(0);
    expect(s.house).toBe(1);
    expect(s.element).toBe('FIRE');
  });

  it('skips house grouping when no house data is supplied', () => {
    const planets = [makePlanet('SUN', 10), makePlanet('VENUS', 40), makePlanet('MARS', 70)];
    // Different signs, no houses → nothing to cluster.
    expect(detectAspectPatterns(planets, [])).toEqual([]);
  });

  it('reports multiple independent stelliums', () => {
    const planets = [
      makePlanet('SUN', 1), makePlanet('VENUS', 12), makePlanet('MERCURY', 25), // Aries
      makePlanet('MARS', 122), makePlanet('JUPITER', 135), makePlanet('SATURN', 148), // Leo
    ];
    const patterns = detectAspectPatterns(planets, []);
    expect(patterns).toHaveLength(2);
    expect(patterns.map((p) => p.sign).sort()).toEqual([0, 4]);
  });
});
