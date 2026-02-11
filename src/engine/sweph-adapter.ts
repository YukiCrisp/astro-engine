import { calc_ut, houses_ex2, set_ephe_path, constants } from 'sweph';
import { readdirSync } from 'node:fs';
import type { PlanetId, PlanetPosition, HouseCusp, ChartAngles, HouseSystem, SignName } from './types.js';

const PLANET_MAP: Record<PlanetId, number> = {
  SUN: constants.SE_SUN,
  MOON: constants.SE_MOON,
  MERCURY: constants.SE_MERCURY,
  VENUS: constants.SE_VENUS,
  MARS: constants.SE_MARS,
  JUPITER: constants.SE_JUPITER,
  SATURN: constants.SE_SATURN,
  URANUS: constants.SE_URANUS,
  NEPTUNE: constants.SE_NEPTUNE,
  PLUTO: constants.SE_PLUTO,
  TRUE_NODE: constants.SE_TRUE_NODE,
  CHIRON: constants.SE_CHIRON,
};

const PLANET_IDS: PlanetId[] = [
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
  'TRUE_NODE', 'CHIRON',
];

const SIGN_NAMES: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

const CALC_FLAGS = constants.SEFLG_SWIEPH | constants.SEFLG_SPEED;

const HOUSE_SYSTEM_MAP: Record<HouseSystem, string> = {
  PLACIDUS: 'P',
  WHOLE_SIGN: 'W',
};

let ephePath: string | null = null;
let chironAvailable = true;

export function initSweph(path: string): void {
  set_ephe_path(path);
  ephePath = path;
  try {
    const jdTest = 2451545.0; // J2000
    const result = calc_ut(jdTest, constants.SE_CHIRON, CALC_FLAGS);
    chironAvailable = result.flag === CALC_FLAGS;
  } catch {
    chironAvailable = false;
    console.warn('astro-engine: seas_*.se1 not found — Chiron will be omitted from results');
  }
}

export function isEphePathSet(): boolean {
  return ephePath !== null;
}

export function epheFilesPresent(): boolean {
  if (!ephePath) return false;
  try {
    const files = readdirSync(ephePath);
    return files.some(f => f.endsWith('.se1'));
  } catch {
    return false;
  }
}

export function calcPlanets(jd: number): PlanetPosition[] {
  return PLANET_IDS.flatMap((id): PlanetPosition[] => {
    if (id === 'CHIRON' && !chironAvailable) return [];
    const result = calc_ut(jd, PLANET_MAP[id], CALC_FLAGS);
    if (result.flag < 0) {
      throw new Error(`sweph calc_ut failed for ${id}: ${result.error}`);
    }
    const lon = result.data[0];
    const lat = result.data[1];
    const speed = result.data[3];
    const sign = Math.floor(lon / 30);
    return [{
      id,
      longitude: lon,
      latitude: lat,
      speed,
      isRetrograde: speed < 0,
      sign,
      signName: SIGN_NAMES[sign],
      degree: lon % 30,
    }];
  });
}

export function calcHouses(
  jd: number, lat: number, lon: number, system: HouseSystem
): { houses: HouseCusp[]; angles: ChartAngles } {
  const result = houses_ex2(jd, 0, lat, lon, HOUSE_SYSTEM_MAP[system]);
  const houses: HouseCusp[] = Array.from({ length: 12 }, (_, i) => ({
    house: i + 1,
    longitude: result.data.houses[i],
  }));
  const asc = result.data.points[0];
  const mc = result.data.points[1];
  const angles: ChartAngles = {
    asc,
    mc,
    dsc: (asc + 180) % 360,
    ic: (mc + 180) % 360,
  };
  return { houses, angles };
}
