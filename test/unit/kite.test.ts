import { describe, it, expect } from 'vitest';
import {
  AspectGraph,
  detectKite,
  detectAspectPatterns,
} from '../../src/engine/calculations/aspect-patterns.js';
import { makePlanet, makeAspect } from './aspect-pattern-helpers.js';

/**
 * The three closing TRINE edges of a grand trine between `a`, `b`, `c`.
 * `orbs` are the per-edge orbs in the order [a-b, b-c, a-c].
 */
function trineTriangle(
  a: string,
  b: string,
  c: string,
  orbs: [number, number, number] = [0, 0, 0],
) {
  return [
    makeAspect(a, b, 'TRINE', 120, orbs[0]),
    makeAspect(b, c, 'TRINE', 120, orbs[1]),
    makeAspect(a, c, 'TRINE', 120, orbs[2]),
  ];
}

/**
 * The three tail edges that turn a grand trine into a kite: `tail` opposes
 * `apexVertex` and sextiles the two `legs`. `orbs` are [opp, sextile1, sextile2].
 */
function kiteTail(
  tail: string,
  apexVertex: string,
  legs: [string, string],
  orbs: [number, number, number] = [0, 0, 0],
) {
  return [
    makeAspect(tail, apexVertex, 'OPPOSITION', 180, orbs[0]),
    makeAspect(tail, legs[0], 'SEXTILE', 60, orbs[1]),
    makeAspect(tail, legs[1], 'SEXTILE', 60, orbs[2]),
  ];
}

describe('detectKite', () => {
  // FIRE grand trine: SUN 0° ARI, MOON 120° LEO, MARS 240° SAG.
  // VENUS 180° LIB opposes SUN and sextiles MOON and MARS — the tail.
  const grandTrine = ['SUN', 'MOON', 'MARS'] as const;

  it('detects a grand trine with a fourth planet as a kite', () => {
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 120),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS'),
      ...kiteTail('VENUS', 'SUN', ['MOON', 'MARS']),
    ];
    const patterns = detectKite(new AspectGraph(planets, aspects));

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('KITE');
    expect([...patterns[0].planets].sort()).toEqual(['MARS', 'MOON', 'SUN', 'VENUS']);
  });

  it('reports the fourth (opposing) planet as the focal apex', () => {
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 120),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS'),
      ...kiteTail('VENUS', 'SUN', ['MOON', 'MARS']),
    ];
    expect(detectKite(new AspectGraph(planets, aspects))[0].apex).toBe('VENUS');
  });

  it('inherits the shared element of the underlying grand trine', () => {
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 120),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS'),
      ...kiteTail('VENUS', 'SUN', ['MOON', 'MARS']),
    ];
    expect(detectKite(new AspectGraph(planets, aspects))[0].element).toBe('FIRE');
  });

  it('leaves element undefined when the grand trine is dissociate', () => {
    // MOON at 114° CAN (WATER) makes the trine span two elements.
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 114),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS', [6, 6, 0]),
      ...kiteTail('VENUS', 'SUN', ['MOON', 'MARS'], [0, 6, 0]),
    ];
    const patterns = detectKite(new AspectGraph(planets, aspects));
    expect(patterns).toHaveLength(1);
    expect(patterns[0].element).toBeUndefined();
  });

  it('averages all six constituent aspects (3 trines, 1 opposition, 2 sextiles)', () => {
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 120),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS', [1, 2, 3]),
      ...kiteTail('VENUS', 'SUN', ['MOON', 'MARS'], [3, 2, 1]),
    ];
    // (1 + 2 + 3 + 3 + 2 + 1) / 6 = 2.
    expect(detectKite(new AspectGraph(planets, aspects))[0].orbAvg).toBe(2);
  });

  it('finds no kite for a bare grand trine (no opposing fourth planet)', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240)];
    const graph = new AspectGraph(planets, [...trineTriangle('SUN', 'MOON', 'MARS')]);
    expect(detectKite(graph)).toEqual([]);
  });

  it('rejects a fourth planet that opposes a vertex but sextiles only one leg', () => {
    // VENUS opposes SUN and sextiles MOON, but its edge to MARS is missing.
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 120),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS'),
      makeAspect('VENUS', 'SUN', 'OPPOSITION', 180, 0),
      makeAspect('VENUS', 'MOON', 'SEXTILE', 60, 0),
    ];
    expect(detectKite(new AspectGraph(planets, aspects))).toEqual([]);
  });

  it('emits one kite per qualifying tail on the same grand trine', () => {
    // VENUS 180° LIB opposes SUN; JUPITER 300° AQU opposes MOON. Both sextile
    // the remaining two vertices, so the grand trine carries two kites.
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 120),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
      makePlanet('JUPITER', 300),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS'),
      ...kiteTail('VENUS', 'SUN', ['MOON', 'MARS']),
      ...kiteTail('JUPITER', 'MOON', ['SUN', 'MARS']),
    ];
    const patterns = detectKite(new AspectGraph(planets, aspects));
    expect(patterns).toHaveLength(2);
    expect(patterns.map((p) => p.apex).sort()).toEqual(['JUPITER', 'VENUS']);
  });
});

describe('detectAspectPatterns (kite registered)', () => {
  it('surfaces a kite through the full detector registry', () => {
    const planets = [
      makePlanet('SUN', 0),
      makePlanet('MOON', 120),
      makePlanet('MARS', 240),
      makePlanet('VENUS', 180),
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS'),
      ...kiteTail('VENUS', 'SUN', ['MOON', 'MARS']),
    ];
    const kites = detectAspectPatterns(planets, aspects).filter((p) => p.type === 'KITE');
    expect(kites).toHaveLength(1);
    expect(kites[0].apex).toBe('VENUS');
    expect(kites[0].planets).toEqual(['SUN', 'MOON', 'MARS', 'VENUS']);
  });
});
