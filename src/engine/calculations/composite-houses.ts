import type { HouseCusp, HouseSystem } from '../types.js';

const normalize360 = (longitude: number): number => ((longitude % 360) + 360) % 360;

export function compositeHouseCusps(
  houseSystem: HouseSystem,
  compositeAsc: number,
  housesA: HouseCusp[], ascA: number,
  housesB: HouseCusp[], ascB: number,
): HouseCusp[] {
  const signStart = Math.floor(compositeAsc / 30) * 30;
  return Array.from({ length: 12 }, (_, i) => {
    let longitude: number;
    if (houseSystem === 'WHOLE_SIGN') {
      longitude = normalize360(signStart + i * 30);
    } else if (houseSystem === 'EQUAL') {
      longitude = (compositeAsc + i * 30) % 360;
    } else if (i === 0) {
      longitude = compositeAsc;
    } else {
      const offsetA = normalize360(housesA[i].longitude - ascA);
      const offsetB = normalize360(housesB[i].longitude - ascB);
      longitude = normalize360(compositeAsc + (offsetA + offsetB) / 2);
    }
    return { house: i + 1, longitude };
  });
}
