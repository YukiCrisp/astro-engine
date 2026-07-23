import { calc_ut, houses_ex2, fixstar2_ut, set_ephe_path, set_sid_mode, constants } from 'sweph';
import { readdirSync } from 'node:fs';
import type { PlanetId, PlanetPosition, HouseCusp, ChartAngles, HouseSystem, ZodiacSystem, SignName } from './types.js';

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
  MEAN_NODE: constants.SE_MEAN_NODE,
  MEAN_LILITH: constants.SE_MEAN_APOG,
  TRUE_LILITH: constants.SE_OSCU_APOG,
  PHOLUS: constants.SE_PHOLUS,
  CERES: constants.SE_CERES,
  PALLAS: constants.SE_PALLAS,
  JUNO: constants.SE_JUNO,
  VESTA: constants.SE_VESTA,
};

/**
 * Canonical (traditional) display order. Every planets[] response follows this
 * order regardless of the order of `enabledPlanets` in the request — client
 * preference arrays are order-unstable (toggle history), so the engine owns it.
 */
const PLANET_IDS: PlanetId[] = [
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
  'CHIRON', 'TRUE_NODE',
  'MEAN_NODE', 'MEAN_LILITH', 'TRUE_LILITH',
  'PHOLUS', 'CERES', 'PALLAS', 'JUNO', 'VESTA',
];

const PLANET_ORDER: ReadonlyMap<PlanetId, number> = new Map(
  PLANET_IDS.map((id, i) => [id, i]),
);

const SIGN_NAMES: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

const CALC_FLAGS = constants.SEFLG_SWIEPH | constants.SEFLG_SPEED;
const CALC_FLAGS_SIDEREAL = CALC_FLAGS | constants.SEFLG_SIDEREAL;

/** Configure sweph for sidereal mode using Lahiri ayanamsa. */
function enableSiderealMode(): void {
  set_sid_mode(constants.SE_SIDM_LAHIRI, 0, 0);
}

/** Get the appropriate calc flags for the given zodiac system. */
function calcFlagsForZodiac(zodiacSystem?: ZodiacSystem): number {
  if (zodiacSystem === 'sidereal') {
    enableSiderealMode();
    return CALC_FLAGS_SIDEREAL;
  }
  return CALC_FLAGS;
}

/** Mean obliquity of the ecliptic in degrees. */
const OBLIQUITY_DEG = 23.4393;
const OBLIQUITY_RAD = OBLIQUITY_DEG * Math.PI / 180;

/** Compute declination from ecliptic longitude and latitude (all in degrees). */
function computeDeclination(lonDeg: number, latDeg: number): number {
  const lonRad = lonDeg * Math.PI / 180;
  const latRad = latDeg * Math.PI / 180;
  const decRad = Math.asin(
    Math.sin(latRad) * Math.cos(OBLIQUITY_RAD) +
    Math.cos(latRad) * Math.sin(OBLIQUITY_RAD) * Math.sin(lonRad)
  );
  return decRad * 180 / Math.PI;
}

const HOUSE_SYSTEM_MAP: Record<HouseSystem, string> = {
  PLACIDUS: 'P',
  WHOLE_SIGN: 'W',
  KOCH: 'K',
  REGIOMONTANUS: 'R',
  CAMPANUS: 'C',
  EQUAL: 'E',
  PORPHYRY: 'O',
};

/** Bodies that require supplementary ephemeris files (seas_*.se1). */
const EXTRA_EPHE_BODIES: Set<PlanetId> = new Set([
  'CHIRON', 'PHOLUS', 'CERES', 'PALLAS', 'JUNO', 'VESTA',
]);

let ephePath: string | null = null;
let extraEpheAvailable = true;

export function initSweph(path: string): void {
  set_ephe_path(path);
  ephePath = path;
  try {
    const jdTest = 2451545.0; // J2000
    const result = calc_ut(jdTest, constants.SE_CHIRON, CALC_FLAGS);
    extraEpheAvailable = result.flag === CALC_FLAGS;
  } catch {
    extraEpheAvailable = false;
    console.warn('astro-engine: seas_*.se1 not found — Chiron/asteroids will be omitted from results');
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

export function calcPlanets(jd: number, enabledPlanets?: PlanetId[], zodiacSystem?: ZodiacSystem): PlanetPosition[] {
  const ids = enabledPlanets
    ? [...enabledPlanets].sort(
        (a, b) => (PLANET_ORDER.get(a) ?? 99) - (PLANET_ORDER.get(b) ?? 99),
      )
    : PLANET_IDS;
  const flags = calcFlagsForZodiac(zodiacSystem);
  return ids.flatMap((id): PlanetPosition[] => {
    if (EXTRA_EPHE_BODIES.has(id) && !extraEpheAvailable) return [];
    const result = calc_ut(jd, PLANET_MAP[id], flags);
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
      declination: computeDeclination(lon, lat),
    }];
  });
}

export function calcSinglePlanet(jd: number, id: PlanetId, zodiacSystem?: ZodiacSystem): PlanetPosition {
  const flags = calcFlagsForZodiac(zodiacSystem);
  const result = calc_ut(jd, PLANET_MAP[id], flags);
  if (result.flag < 0) {
    throw new Error(`sweph calc_ut failed for ${id}: ${result.error}`);
  }
  const lon = result.data[0];
  const lat = result.data[1];
  const speed = result.data[3];
  const sign = Math.floor(lon / 30);
  return {
    id,
    longitude: lon,
    latitude: lat,
    speed,
    isRetrograde: speed < 0,
    sign,
    signName: SIGN_NAMES[sign],
    degree: lon % 30,
    declination: computeDeclination(lon, lat),
  };
}

export interface FixedStarRaw {
  longitude: number;
  latitude: number;
}

/**
 * Try to calculate a fixed star position using sweph's fixstar2_ut.
 * Returns null if the function fails (e.g. sefstars.txt not found).
 */
export function calcFixedStar(starName: string, jd: number): FixedStarRaw | null {
  try {
    const flags = constants.SEFLG_SWIEPH;
    const result = fixstar2_ut(starName, jd, flags);
    if (result.flag === constants.ERR) return null;
    return { longitude: result.data[0], latitude: result.data[1] };
  } catch {
    return null;
  }
}

export function calcHouses(
  jd: number, lat: number, lon: number, system: HouseSystem, zodiacSystem?: ZodiacSystem
): { houses: HouseCusp[]; angles: ChartAngles } {
  const hsysFlags = zodiacSystem === 'sidereal' ? constants.SEFLG_SIDEREAL : 0;
  if (zodiacSystem === 'sidereal') {
    enableSiderealMode();
  }
  const result = houses_ex2(jd, hsysFlags, lat, lon, HOUSE_SYSTEM_MAP[system]);
  const houses: HouseCusp[] = Array.from({ length: 12 }, (_, i) => ({
    house: i + 1,
    longitude: result.data.houses[i],
  }));
  const asc = result.data.points[0];
  const mc = result.data.points[1];
  const vertex = result.data.points[3];
  const eastPoint = result.data.points[4];
  const angles: ChartAngles = {
    asc,
    mc,
    dsc: (asc + 180) % 360,
    ic: (mc + 180) % 360,
    vertex,
    eastPoint,
    partOfFortune: 0, // computed later in engine/index.ts after planets are known
  };
  return { houses, angles };
}
