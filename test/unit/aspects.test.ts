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

// Transit positions for 2026-10-09 as returned by get_transit_chart (Issue #30).
// Venus is retrograde; Pluto is retrograde and nearly stationary.
const SKY_2026_10_09 = {
  SUN: makePlanet('SUN', 196.4, 0.99),
  MERCURY: makePlanet('MERCURY', 220.65, 1.11),
  VENUS: makePlanet('VENUS', 217.82, -0.23),
  MARS: makePlanet('MARS', 126.36, 0.57),
  PLUTO: makePlanet('PLUTO', 303.08, -0.003),
};

function findAspect(
  aspects: ReturnType<typeof detectAspects>,
  x: string,
  y: string,
) {
  return aspects.find(
    (a) => (a.planetA === x && a.planetB === y) || (a.planetA === y && a.planetB === x),
  );
}

describe('detectAspects applying (relative motion)', () => {
  const { SUN, MERCURY, VENUS, MARS, PLUTO } = SKY_2026_10_09;

  // Run both orderings: the result must not depend on which planet comes first.
  for (const [label, planets] of [
    ['engine order', [SUN, MERCURY, VENUS, MARS, PLUTO]],
    ['reversed order', [PLUTO, MARS, VENUS, MERCURY, SUN]],
  ] as const) {
    describe(label, () => {
      const aspects = detectAspects([...planets]);

      it('retrograde Venus square Mars is applying (exact 2026-10-10T21:31Z)', () => {
        const a = findAspect(aspects, 'VENUS', 'MARS');
        expect(a?.type).toBe('SQUARE');
        expect(a?.orb).toBeCloseTo(1.46, 2);
        expect(a?.applying).toBe(true);
      });

      it('Mercury conjunct retrograde Venus is separating', () => {
        const a = findAspect(aspects, 'MERCURY', 'VENUS');
        expect(a?.type).toBe('CONJUNCTION');
        expect(a?.orb).toBeCloseTo(2.83, 2);
        expect(a?.applying).toBe(false);
      });

      it('retrograde Venus square retrograde Pluto is applying', () => {
        const a = findAspect(aspects, 'VENUS', 'PLUTO');
        expect(a?.type).toBe('SQUARE');
        expect(a?.orb).toBeCloseTo(4.74, 2);
        expect(a?.applying).toBe(true);
      });

      it('direct Sun quintile direct Mars is applying', () => {
        const a = findAspect(aspects, 'SUN', 'MARS');
        expect(a?.type).toBe('QUINTILE');
        expect(a?.applying).toBe(true);
      });

      it('direct Mars opposite retrograde Pluto is separating (exact 2026-10-03T10:38Z)', () => {
        // Opposition point is Leo 3.08; Mars at Leo 6.36 has already passed it.
        const a = findAspect(aspects, 'MARS', 'PLUTO');
        expect(a?.type).toBe('OPPOSITION');
        expect(a?.applying).toBe(false);
      });
    });
  }

  it('a faster planet behind a slower one is applying to the conjunction', () => {
    const aspects = detectAspects([makePlanet('MARS', 12, 0.5), makePlanet('VENUS', 10, 1.2)]);
    expect(aspects[0].applying).toBe(true);
  });

  it('a faster planet ahead of a slower one is separating from the conjunction', () => {
    const aspects = detectAspects([makePlanet('VENUS', 12, 1.2), makePlanet('MARS', 10, 0.5)]);
    expect(aspects[0].applying).toBe(false);
  });

  it('handles the 0°/360° wrap', () => {
    // Venus at 358 moving forward toward Mars at 2 → applying conjunction
    const aspects = detectAspects([makePlanet('MARS', 2, 0.5), makePlanet('VENUS', 358, 1.2)]);
    expect(aspects[0].type).toBe('CONJUNCTION');
    expect(aspects[0].applying).toBe(true);
  });

  it('is not applying when both planets move at the same speed', () => {
    const aspects = detectAspects([makePlanet('MARS', 10, 1), makePlanet('VENUS', 100, 1)]);
    expect(aspects[0].applying).toBe(false);
  });

  it('leaves applying undefined when computeApplying is false', () => {
    const aspects = detectAspects([VENUS, MARS], 1, undefined, false);
    expect(aspects[0].applying).toBeUndefined();
  });
});

describe('detectCrossAspects applying (planetsA fixed, planetsB moving)', () => {
  it('retrograde transit backing toward a natal point is applying', () => {
    // Square point is 217; transit Venus 217.82 R moves back toward it.
    const natal = [makePlanet('MARS', 127, 0.7)];
    const transit = [SKY_2026_10_09.VENUS];
    const aspects = detectCrossAspects(natal, transit, undefined, true);
    expect(aspects[0].type).toBe('SQUARE');
    expect(aspects[0].applying).toBe(true);
  });

  it('retrograde transit backing away from a natal point is separating', () => {
    const natal = [makePlanet('MARS', 128.5, -0.2)];
    const transit = [SKY_2026_10_09.VENUS];
    const aspects = detectCrossAspects(natal, transit, undefined, true);
    expect(aspects[0].type).toBe('SQUARE');
    expect(aspects[0].applying).toBe(false);
  });

  it('ignores the natal speed: a slow transit moving past a fast natal planet is separating', () => {
    // The natal Moon does not move, however fast it was at birth.
    // Transit Saturn at 53 moves forward, away from natal Moon at 50.
    const natal = [makePlanet('MOON', 50, 13)];
    const transit = [makePlanet('SATURN', 53, 0.05)];
    const aspects = detectCrossAspects(natal, transit, undefined, true);
    expect(aspects[0].type).toBe('CONJUNCTION');
    expect(aspects[0].applying).toBe(false);
  });

  it('leaves applying undefined by default (synastry)', () => {
    const aspects = detectCrossAspects([makePlanet('MARS', 0)], [makePlanet('SATURN', 3)]);
    expect(aspects[0].applying).toBeUndefined();
  });
});
