import { describe, it, expect } from 'vitest';
import {
  AspectGraph,
  detectGrandTrine,
  detectAspectPatterns,
} from '../../src/engine/calculations/aspect-patterns.js';
import { makePlanet, makeAspect } from './aspect-pattern-helpers.js';

/**
 * Build the closing TRINE edges of a grand trine between three planets.
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

describe('detectGrandTrine', () => {
  it('detects three planets forming a closed trine triangle', () => {
    // SUN 0° ARI, MOON 120° LEO, MARS 240° SAG — all FIRE.
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240)];
    const graph = new AspectGraph(planets, trineTriangle('SUN', 'MOON', 'MARS'));

    const patterns = detectGrandTrine(graph);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('GRAND_TRINE');
    expect([...patterns[0].planets].sort()).toEqual(['MARS', 'MOON', 'SUN']);
    expect(patterns[0].apex).toBeUndefined();
    expect(patterns[0].modality).toBeUndefined();
  });

  it('labels the shared element when all three planets share one', () => {
    // FIRE: ARI / LEO / SAG.
    const fire = new AspectGraph(
      [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240)],
      trineTriangle('SUN', 'MOON', 'MARS'),
    );
    expect(detectGrandTrine(fire)[0].element).toBe('FIRE');

    // EARTH: TAU 30 / VIR 150 / CAP 270.
    const earth = new AspectGraph(
      [makePlanet('SUN', 30), makePlanet('MOON', 150), makePlanet('MARS', 270)],
      trineTriangle('SUN', 'MOON', 'MARS'),
    );
    expect(detectGrandTrine(earth)[0].element).toBe('EARTH');

    // WATER: CAN 90 / SCO 210 / PIS 330.
    const water = new AspectGraph(
      [makePlanet('SUN', 90), makePlanet('MOON', 210), makePlanet('MARS', 330)],
      trineTriangle('SUN', 'MOON', 'MARS'),
    );
    expect(detectGrandTrine(water)[0].element).toBe('WATER');
  });

  it('leaves element undefined for a dissociate trine spanning elements', () => {
    // SUN 0° ARI (FIRE), MOON 114° CAN (WATER), MARS 240° SAG (FIRE).
    // Each pair is still within trine orb, but the signs span two elements.
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 114), makePlanet('MARS', 240)];
    const graph = new AspectGraph(planets, trineTriangle('SUN', 'MOON', 'MARS', [6, 6, 0]));

    const patterns = detectGrandTrine(graph);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].element).toBeUndefined();
  });

  it('averages the orbs of the three constituent trines', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240)];
    const graph = new AspectGraph(planets, trineTriangle('SUN', 'MOON', 'MARS', [1, 2, 3]));

    expect(detectGrandTrine(graph)[0].orbAvg).toBe(2);
  });

  it('does not flag an open triangle missing the closing trine', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240)];
    const aspects = [
      makeAspect('SUN', 'MOON', 'TRINE', 120, 1),
      makeAspect('MOON', 'MARS', 'TRINE', 120, 2),
      // SUN–MARS edge absent.
    ];
    expect(detectGrandTrine(new AspectGraph(planets, aspects))).toEqual([]);
  });

  it('does not flag three planets whose triangle is not all trines', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('VENUS', 60)];
    const aspects = [
      makeAspect('SUN', 'MOON', 'TRINE', 120, 1),
      makeAspect('SUN', 'VENUS', 'SEXTILE', 60, 1),
      makeAspect('MOON', 'VENUS', 'SEXTILE', 60, 1),
    ];
    expect(detectGrandTrine(new AspectGraph(planets, aspects))).toEqual([]);
  });

  it('finds every distinct grand trine in a chart, each reported once', () => {
    // Two independent fire/earth grand trines sharing no planets.
    const planets = [
      makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240), // FIRE
      makePlanet('VENUS', 30), makePlanet('JUPITER', 150), makePlanet('SATURN', 270), // EARTH
    ];
    const aspects = [
      ...trineTriangle('SUN', 'MOON', 'MARS'),
      ...trineTriangle('VENUS', 'JUPITER', 'SATURN'),
    ];
    const patterns = detectGrandTrine(new AspectGraph(planets, aspects));

    expect(patterns).toHaveLength(2);
    expect(patterns.map((p) => p.element).sort()).toEqual(['EARTH', 'FIRE']);
  });

  it('enumerates each triangle of an interlocking four-planet trine web', () => {
    // Four fire-ish planets all mutually trine would be degenerate in longitude,
    // so use four planets where SUN/MOON/MARS and SUN/MOON/PLUTO both close.
    const planets = [
      makePlanet('SUN', 0), makePlanet('MOON', 120),
      makePlanet('MARS', 240), makePlanet('PLUTO', 240),
    ];
    const aspects = [
      makeAspect('SUN', 'MOON', 'TRINE', 120, 0),
      makeAspect('SUN', 'MARS', 'TRINE', 120, 0),
      makeAspect('MOON', 'MARS', 'TRINE', 120, 0),
      makeAspect('SUN', 'PLUTO', 'TRINE', 120, 0),
      makeAspect('MOON', 'PLUTO', 'TRINE', 120, 0),
    ];
    // Triangles: {SUN,MOON,MARS} and {SUN,MOON,PLUTO}. MARS–PLUTO not aspected.
    const patterns = detectGrandTrine(new AspectGraph(planets, aspects));
    expect(patterns).toHaveLength(2);
  });
});

describe('detectAspectPatterns integration', () => {
  it('surfaces grand trines through the registry', () => {
    const planets = [makePlanet('SUN', 0), makePlanet('MOON', 120), makePlanet('MARS', 240)];
    const aspects = trineTriangle('SUN', 'MOON', 'MARS', [1, 1, 1]);

    const patterns = detectAspectPatterns(planets, aspects);
    const grandTrines = patterns.filter((p) => p.type === 'GRAND_TRINE');

    expect(grandTrines).toHaveLength(1);
    expect(grandTrines[0].element).toBe('FIRE');
  });
});
