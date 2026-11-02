import type { HouseCusp, HouseSystem } from '../types.js';

const normalize360 = (longitude: number): number => ((longitude % 360) + 360) % 360;

/** Systems whose 1st cusp is the ASC and 10th cusp the MC, with the cusps between them unequal. */
const QUADRANT_SYSTEMS: ReadonlySet<HouseSystem> = new Set([
  'PLACIDUS', 'KOCH', 'REGIOMONTANUS', 'CAMPANUS', 'PORPHYRY', 'TOPOCENTRIC', 'ALCABITIUS',
]);

/** Systems that divide the equator from the meridian; their 1st cusp is not the ASC. */
const MERIDIAN_BASED: ReadonlySet<HouseSystem> = new Set(['MERIDIAN', 'MORINUS']);

/** Whether the composite MC is the 10th cusp (true) or the midpoint of the two MCs (false). */
export const compositeMcIsTenthCusp = (houseSystem: HouseSystem): boolean =>
  QUADRANT_SYSTEMS.has(houseSystem);

export function compositeHouseCusps(
  houseSystem: HouseSystem,
  composite: { asc: number; mc: number },
  housesA: HouseCusp[], anglesA: { asc: number; mc: number },
  housesB: HouseCusp[], anglesB: { asc: number; mc: number },
): HouseCusp[] {
  const signStart = Math.floor(composite.asc / 30) * 30;
  // Averages each natal cusp's offset from its ASC in both charts.
  const averagedFromAsc = (i: number): number => {
    const offsetA = normalize360(housesA[i].longitude - anglesA.asc);
    const offsetB = normalize360(housesB[i].longitude - anglesB.asc);
    return normalize360(composite.asc + (offsetA + offsetB) / 2);
  };
  // Meridian-based cusps sit within a few degrees of MC + 30° steps, so the
  // signed gap from that step is averaged; a raw offset from the MC would wrap at 0°.
  const averagedFromMcSteps = (i: number): number => {
    const step = (i - 9) * 30;
    const gap = (cusp: number, mc: number) => ((normalize360(cusp - mc - step) + 180) % 360) - 180;
    const gapA = gap(housesA[i].longitude, anglesA.mc);
    const gapB = gap(housesB[i].longitude, anglesB.mc);
    return normalize360(composite.mc + step + (gapA + gapB) / 2);
  };
  return Array.from({ length: 12 }, (_, i) => {
    let longitude: number;
    if (houseSystem === 'WHOLE_SIGN') {
      longitude = normalize360(signStart + i * 30);
    } else if (houseSystem === 'EQUAL') {
      longitude = normalize360(composite.asc + i * 30);
    } else if (houseSystem === 'EQUAL_MC') {
      longitude = normalize360(composite.mc + (i - 9) * 30);
    } else if (houseSystem === 'VEHLOW') {
      longitude = normalize360(composite.asc - 15 + i * 30);
    } else if (MERIDIAN_BASED.has(houseSystem)) {
      longitude = averagedFromMcSteps(i);
    } else if (i === 0) {
      longitude = composite.asc;
    } else {
      longitude = averagedFromAsc(i);
    }
    return { house: i + 1, longitude };
  });
}
