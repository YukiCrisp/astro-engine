import type { HouseCusp } from '../types.js';

export function getPlanetHouse(longitude: number, houses: HouseCusp[]): number {
  for (let i = 0; i < 12; i++) {
    const cusp = houses[i].longitude;
    const nextCusp = houses[(i + 1) % 12].longitude;
    if (cusp <= nextCusp) {
      if (longitude >= cusp && longitude < nextCusp) return i + 1;
    } else {
      if (longitude >= cusp || longitude < nextCusp) return i + 1;
    }
  }
  return 1;
}
