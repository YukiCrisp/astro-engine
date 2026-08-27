import type { PlanetId, PointId } from '../types.js';

const NON_POINT_BODY_IDS: readonly PlanetId[] = [
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
  'CHIRON', 'PHOLUS', 'CERES', 'PALLAS', 'JUNO', 'VESTA',
];

export function resolveEnabledBodies(
  enabledPlanets?: PlanetId[],
  enabledPoints?: PointId[],
): PlanetId[] | undefined {
  if (enabledPoints === undefined) return enabledPlanets;

  return [...new Set([
    ...(enabledPlanets ?? NON_POINT_BODY_IDS),
    ...enabledPoints,
  ])];
}
