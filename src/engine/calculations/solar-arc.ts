import type { PlanetPosition, SignName } from '../types.js';

const SIGN_NAMES: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

export function calculateSolarArcPositions(
  natalPlanets: PlanetPosition[],
  natalSunLongitude: number,
  progressedSunLongitude: number,
): PlanetPosition[] {
  // The arc = progressed Sun longitude - natal Sun longitude
  const arc = progressedSunLongitude - natalSunLongitude;

  return natalPlanets.map((planet) => {
    const newLongitude = ((planet.longitude + arc) % 360 + 360) % 360;
    const signIndex = Math.floor(newLongitude / 30);
    return {
      ...planet,
      longitude: newLongitude,
      sign: signIndex,
      signName: SIGN_NAMES[signIndex],
      degree: newLongitude % 30,
      speed: 0, // directed positions don't have speed
      isRetrograde: false,
    };
  });
}
