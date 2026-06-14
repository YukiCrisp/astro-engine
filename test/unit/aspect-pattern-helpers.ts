import type { PlanetPosition, Aspect, AspectType, PlanetId } from '../../src/engine/types.js';

const SIGN_NAMES = ['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS'] as const;

/**
 * Shared fixtures for the aspect-pattern detector tests (foundation + each
 * detector). Kept in a plain module — not a `.test.ts` file — so importing the
 * helpers does not re-run another file's `describe` blocks.
 */

/** Build a minimal planet at a given longitude. */
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

/** Build an aspect edge between two planets. */
export function makeAspect(
  planetA: string,
  planetB: string,
  type: AspectType,
  angle: number,
  orb = 0,
): Aspect {
  return { planetA: planetA as PlanetId, planetB: planetB as PlanetId, type, angle, orb };
}
