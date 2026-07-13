import { calcPlanets, calcHouses } from './sweph-adapter.js';
import { detectAspects, detectCrossAspects } from './calculations/aspects.js';
import type { AspectConfig } from './calculations/aspects.js';
import { getProgressedJulianDay } from './calculations/progressions.js';
import { calculateSolarArcPositions } from './calculations/solar-arc.js';
import { findSolarReturnJD } from './calculations/solar-return.js';
import { findLunarReturnJD, listLunarReturnsInYear } from './calculations/lunar-return.js';
import { midpointLongitude } from './calculations/composite.js';
import { calculateVocPeriods } from './calculations/voc-moon.js';
import { computeTransitEvents, shiftedAnglesFor, signedAspectOrb } from './calculations/transit-events.js';
import { analyzeChart } from './calculations/chart-analysis.js';
import type { ChartAnalysis } from './calculations/chart-analysis.js';
import { detectAspectPatterns } from './calculations/aspect-patterns.js';
import type { AspectPattern } from './calculations/aspect-patterns.js';
import { calculateArabicParts } from './calculations/arabic-parts.js';
import type { ArabicPartId } from './calculations/arabic-parts.js';
import { calculateFixedStars } from './calculations/fixed-stars.js';
import { computeAstromapLines, computeAstromapParans, ASTROMAP_PLANETS } from './calculations/astrocartography.js';
import { buildJulianDay, toJulianDay, fromJulianDay, parseDateString } from '../utils/date.js';
import { SCHEMA_VERSION } from './types.js';
import type {
  NatalChartData, HouseSystem, ZodiacSystem, TripleChartData,
  SynastryChartData, CompositeTransitChartData, EphemerisData, EphemerisEvent,
  VocMoonData, AstromapData, TransitEventsData,
  PlanetId, PlanetPosition, AspectType, SignName,
} from './types.js';

function computePartOfFortune(angles: import('./types.js').ChartAngles, planets: import('./types.js').PlanetPosition[]): void {
  const sun = planets.find(p => p.id === 'SUN');
  const moon = planets.find(p => p.id === 'MOON');
  if (sun && moon) {
    angles.partOfFortune = (angles.asc + moon.longitude - sun.longitude + 360) % 360;
  }
}

export interface EngineFilterParams {
  enabledPlanets?: PlanetId[];
  enabledAspects?: AspectType[];
  aspectOrbs?: Partial<Record<AspectType, number>>;
  sunOrbBonus?: number;
  moonOrbBonus?: number;
  enabledArabicParts?: ArabicPartId[];
  includeFixedStars?: boolean;
}

function computeArabicParts(
  angles: import('./types.js').ChartAngles,
  planets: import('./types.js').PlanetPosition[],
  houses: import('./types.js').HouseCusp[],
  enabledParts: ArabicPartId[],
): import('./types.js').ArabicPartResult[] {
  const sun = planets.find(p => p.id === 'SUN');
  const moon = planets.find(p => p.id === 'MOON');
  const venus = planets.find(p => p.id === 'VENUS');
  if (!sun || !moon || !venus) return [];

  // Determine day/night: Sun above horizon = houses 7-12
  const sunHouse = getHouseForLongitude(sun.longitude, houses);
  const isDayChart = sunHouse >= 7;

  return calculateArabicParts(
    angles.asc, sun.longitude, moon.longitude,
    venus.longitude, angles.dsc, isDayChart, enabledParts,
  );
}

function getHouseForLongitude(longitude: number, houses: import('./types.js').HouseCusp[]): number {
  const sorted = [...houses].sort((a, b) => a.house - b.house);
  for (let i = 0; i < sorted.length; i++) {
    const cusp = sorted[i].longitude;
    const nextCusp = sorted[(i + 1) % sorted.length].longitude;
    if (nextCusp > cusp) {
      if (longitude >= cusp && longitude < nextCusp) return sorted[i].house;
    } else {
      // Wraps around 360
      if (longitude >= cusp || longitude < nextCusp) return sorted[i].house;
    }
  }
  return 1;
}

function toAspectConfig(p?: EngineFilterParams): AspectConfig | undefined {
  if (!p) return undefined;
  if (!p.enabledAspects && !p.aspectOrbs && p.sunOrbBonus === undefined && p.moonOrbBonus === undefined) return undefined;
  return {
    enabledAspects: p.enabledAspects,
    orbOverrides: p.aspectOrbs,
    sunOrbBonus: p.sunOrbBonus,
    moonOrbBonus: p.moonOrbBonus,
  };
}

/**
 * A single chart augmented with the special aspect patterns found in its own
 * geometry (grand trine, T-square, etc.).
 */
export type NatalChartWithPatterns = NatalChartData & { aspectPatterns: AspectPattern[] };

/**
 * Attach `aspectPatterns` to a single-chart result, reusing the same detection
 * path as `analyzeChart` (`detectAspectPatterns`). Used by the composite and
 * derived single charts (progressed / solar-arc / solar & lunar return /
 * transit) so their responses carry special aspect shapes like natal does.
 * Inter-chart (synastry / transit-overlay) patterns are out of scope (phase 2).
 */
export function attachAspectPatterns(chart: NatalChartData): NatalChartWithPatterns {
  return {
    ...chart,
    aspectPatterns: detectAspectPatterns(chart.planets, chart.aspects, {}, chart.houses),
  };
}

export function calculateNatal(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
} & EngineFilterParams): NatalChartData {
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';
  const jd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const planets = calcPlanets(jd, params.enabledPlanets, zodiac);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));

  if (params.birthTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: jd },
    };
  }

  const { houses, angles } = calcHouses(jd, params.lat, params.lon, params.houseSystem, zodiac);
  computePartOfFortune(angles, planets);
  const result: NatalChartData = {
    planets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: jd },
  };
  if (params.enabledArabicParts && params.enabledArabicParts.length > 0 && houses) {
    result.arabicParts = computeArabicParts(angles, planets, houses, params.enabledArabicParts);
  }
  if (params.includeFixedStars) {
    result.fixedStars = calculateFixedStars(jd);
  }
  return result;
}

export function calculateNatalAnalysis(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
} & EngineFilterParams): NatalChartData & { analysis: ChartAnalysis } {
  const chart = calculateNatal(params);
  const analysis = analyzeChart(chart.planets, chart.houses, chart.angles, chart.aspects);
  return { ...chart, analysis };
}

export function calculateProgressed(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
  progressedDate: string;
  relocatedLat?: number; relocatedLon?: number;
} & EngineFilterParams): NatalChartData {
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';
  const jd = getProgressedJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes, params.progressedDate);
  const planets = calcPlanets(jd, params.enabledPlanets, zodiac);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));

  if (params.birthTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: jd },
    };
  }

  const houseLat = params.relocatedLat ?? params.lat;
  const houseLon = params.relocatedLon ?? params.lon;
  const { houses, angles } = calcHouses(jd, houseLat, houseLon, params.houseSystem, zodiac);
  computePartOfFortune(angles, planets);
  return {
    planets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: jd },
  };
}

export function calculateTransit(params: {
  transitDate: string; transitTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
} & EngineFilterParams): NatalChartData {
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';
  const jd = buildJulianDay(params.transitDate, params.transitTime, params.utcOffsetMinutes);
  const planets = calcPlanets(jd, params.enabledPlanets, zodiac);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));

  if (params.transitTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: jd },
    };
  }

  const { houses, angles } = calcHouses(jd, params.lat, params.lon, params.houseSystem, zodiac);
  computePartOfFortune(angles, planets);
  return {
    planets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: jd },
  };
}

export function calculateTriple(params: {
  natal: Parameters<typeof calculateNatal>[0];
  progressedDate: string;
  transit: Parameters<typeof calculateTransit>[0];
  computeCrossAspects: boolean;
} & EngineFilterParams): TripleChartData {
  const filterParams: EngineFilterParams = {
    enabledPlanets: params.enabledPlanets,
    enabledAspects: params.enabledAspects,
    aspectOrbs: params.aspectOrbs,
    sunOrbBonus: params.sunOrbBonus,
    moonOrbBonus: params.moonOrbBonus,
  };
  const natal = calculateNatal({ ...params.natal, ...filterParams });
  const progressed = calculateProgressed({ ...params.natal, progressedDate: params.progressedDate, ...filterParams });
  const transit = calculateTransit({ ...params.transit, ...filterParams });
  const aspectConfig = toAspectConfig(filterParams);
  return {
    natal, progressed, transit,
    crossAspects: params.computeCrossAspects ? {
      // Triple-chart cross aspects involve at least one moving side
      // (progressed/transit), so applying is meaningful.
      natalToProgressed: detectCrossAspects(natal.planets, progressed.planets, aspectConfig, true),
      natalToTransit: detectCrossAspects(natal.planets, transit.planets, aspectConfig, true),
      progressedToTransit: detectCrossAspects(progressed.planets, transit.planets, aspectConfig, true),
    } : { natalToProgressed: [], natalToTransit: [], progressedToTransit: [] },
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}

export function calculateSynastry(params: {
  personA: Parameters<typeof calculateNatal>[0];
  personB: Parameters<typeof calculateNatal>[0];
} & EngineFilterParams): SynastryChartData {
  const filterParams: EngineFilterParams = {
    enabledPlanets: params.enabledPlanets,
    enabledAspects: params.enabledAspects,
    aspectOrbs: params.aspectOrbs,
    sunOrbBonus: params.sunOrbBonus,
    moonOrbBonus: params.moonOrbBonus,
  };
  const personA = calculateNatal({ ...params.personA, ...filterParams });
  const personB = calculateNatal({ ...params.personB, ...filterParams });
  const crossAspects = detectCrossAspects(personA.planets, personB.planets, toAspectConfig(filterParams));
  return {
    personA, personB, crossAspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}

export function calculateComposite(params: {
  personA: Parameters<typeof calculateNatal>[0];
  personB: Parameters<typeof calculateNatal>[0];
} & EngineFilterParams): NatalChartData {
  const filterParams: EngineFilterParams = {
    enabledPlanets: params.enabledPlanets,
    enabledAspects: params.enabledAspects,
    aspectOrbs: params.aspectOrbs,
    sunOrbBonus: params.sunOrbBonus,
    moonOrbBonus: params.moonOrbBonus,
  };
  const chartA = calculateNatal({ ...params.personA, ...filterParams });
  const chartB = calculateNatal({ ...params.personB, ...filterParams });

  const SIGN_NAMES: readonly SignName[] = [
    'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
    'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
  ];

  // Composite planets: shorter-arc midpoint of each pair
  const planets: PlanetPosition[] = chartA.planets.map((pA) => {
    const pB = chartB.planets.find((p) => p.id === pA.id);
    if (!pB) return pA;
    const lon = midpointLongitude(pA.longitude, pB.longitude);
    const lat = (pA.latitude + pB.latitude) / 2;
    const speed = (pA.speed + pB.speed) / 2;
    const sign = Math.floor(lon / 30);
    const declination = (pA.declination + pB.declination) / 2;
    return {
      id: pA.id,
      longitude: lon,
      latitude: lat,
      speed,
      isRetrograde: speed < 0,
      sign,
      signName: SIGN_NAMES[sign],
      degree: lon % 30,
      declination,
    };
  });

  // Composite is a synthetic midpoint chart with no time evolution —
  // applying has no meaning here.
  const aspects = detectAspects(planets, 1, toAspectConfig(filterParams), false);

  if (chartA.angles && chartB.angles && params.personA.birthTime !== null && params.personB.birthTime !== null) {
    const compositeAsc = midpointLongitude(chartA.angles.asc, chartB.angles.asc);
    const compositeMc = midpointLongitude(chartA.angles.mc, chartB.angles.mc);

    // Equal Houses from composite ASC — 12 cusps at 30° intervals.
    // This ensures houses[0].longitude === compositeAsc, so the wheel
    // rotation, house lines, and ASC label all agree.
    const houses: import('./types.js').HouseCusp[] = Array.from({ length: 12 }, (_, i) => ({
      house: i + 1,
      longitude: (compositeAsc + i * 30) % 360,
    }));

    const midJd = (chartA.meta.julianDay + chartB.meta.julianDay) / 2;

    const angles: import('./types.js').ChartAngles = {
      asc: compositeAsc,
      mc: compositeMc,
      dsc: (compositeAsc + 180) % 360,
      ic: (compositeMc + 180) % 360,
      vertex: midpointLongitude(chartA.angles.vertex, chartB.angles.vertex),
      eastPoint: midpointLongitude(chartA.angles.eastPoint, chartB.angles.eastPoint),
      partOfFortune: 0,
    };
    computePartOfFortune(angles, planets);

    return {
      planets, houses, angles, aspects,
      meta: {
        schemaVersion: SCHEMA_VERSION,
        calculatedAt: new Date().toISOString(),
        houseSystem: params.personA.houseSystem,
        zodiacSystem: params.personA.zodiacSystem ?? 'tropical',
        julianDay: midJd,
      },
    };
  }

  return {
    planets, houses: null, angles: null, aspects,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      calculatedAt: new Date().toISOString(),
      houseSystem: params.personA.houseSystem,
      zodiacSystem: params.personA.zodiacSystem ?? 'tropical',
      julianDay: 0,
    },
  };
}

export function calculateCompositeTransit(params: {
  personA: Parameters<typeof calculateNatal>[0];
  personB: Parameters<typeof calculateNatal>[0];
  transit: Parameters<typeof calculateTransit>[0];
} & EngineFilterParams): CompositeTransitChartData {
  const filterParams: EngineFilterParams = {
    enabledPlanets: params.enabledPlanets,
    enabledAspects: params.enabledAspects,
    aspectOrbs: params.aspectOrbs,
    sunOrbBonus: params.sunOrbBonus,
    moonOrbBonus: params.moonOrbBonus,
  };
  const composite = calculateComposite({ personA: params.personA, personB: params.personB, ...filterParams });
  const transit = calculateTransit({ ...params.transit, ...filterParams });
  // Composite is static, transit moves → applying is meaningful for the cross-aspects.
  const crossAspects = detectCrossAspects(composite.planets, transit.planets, toAspectConfig(filterParams), true);
  return {
    composite, transit, crossAspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}

export function calculateSolarArc(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
  progressedDate: string;
} & EngineFilterParams): NatalChartData {
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';

  // 1. Calculate the natal chart
  const natalJd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const natalPlanets = calcPlanets(natalJd, params.enabledPlanets, zodiac);
  const natalSun = natalPlanets.find(p => p.id === 'SUN');
  if (!natalSun) throw new Error('Could not calculate natal Sun position');

  // 2. Get the progressed Sun position for the target date
  const progressedJd = getProgressedJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes, params.progressedDate);
  const progressedPlanets = calcPlanets(progressedJd, ['SUN'], zodiac);
  const progressedSun = progressedPlanets.find(p => p.id === 'SUN');
  if (!progressedSun) throw new Error('Could not calculate progressed Sun position');

  // 3. Apply the solar arc to all natal planets
  const directedPlanets = calculateSolarArcPositions(natalPlanets, natalSun.longitude, progressedSun.longitude);
  const aspects = detectAspects(directedPlanets, 1, toAspectConfig(params));

  if (params.birthTime === null) {
    return {
      planets: directedPlanets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: natalJd },
    };
  }

  // For houses, use natal houses (solar arc doesn't progress houses)
  const { houses, angles } = calcHouses(natalJd, params.lat, params.lon, params.houseSystem, zodiac);
  computePartOfFortune(angles, directedPlanets);

  return {
    planets: directedPlanets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, zodiacSystem: zodiac, julianDay: natalJd },
  };
}

export function calculateSolarReturn(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number;
  year: number;
  returnLat: number; returnLon: number;
  returnUtcOffsetMinutes: number;
  houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
} & EngineFilterParams): NatalChartData {
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';
  // 1. Get natal Sun longitude (always tropical for finding the return moment)
  const natalJd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const natalPlanets = calcPlanets(natalJd, ['SUN']);
  const natalSun = natalPlanets.find(p => p.id === 'SUN');
  if (!natalSun) throw new Error('Could not calculate natal Sun position');

  // 2. Find the exact JD of the solar return
  const { year: birthYear, month: birthMonth, day: birthDay } = parseDateString(params.birthDate);
  const solarReturnJd = findSolarReturnJD(
    natalSun.longitude, birthYear, birthMonth, birthDay, params.year,
  );

  // 3. Calculate full chart at that JD using return location
  const planets = calcPlanets(solarReturnJd, params.enabledPlanets, zodiac);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));
  const { houses, angles } = calcHouses(solarReturnJd, params.returnLat, params.returnLon, params.houseSystem, zodiac);
  computePartOfFortune(angles, planets);

  return {
    planets, houses, angles, aspects,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      calculatedAt: new Date().toISOString(),
      houseSystem: params.houseSystem,
      zodiacSystem: zodiac,
      julianDay: solarReturnJd,
    },
  };
}

export function calculateLunarReturn(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number;
  targetDate: string;
  returnJd?: number;
  returnLat: number; returnLon: number;
  returnUtcOffsetMinutes: number;
  houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
} & EngineFilterParams): NatalChartData {
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';
  // 1. Get natal Moon longitude (always tropical for finding the return moment)
  const natalJd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const natalPlanets = calcPlanets(natalJd, ['MOON']);
  const natalMoon = natalPlanets.find(p => p.id === 'MOON');
  if (!natalMoon) throw new Error('Could not calculate natal Moon position');

  // 2. Use the explicit return JD when provided (selecting a listed return);
  //    otherwise solve for the next return after targetDate.
  const lunarReturnJd = params.returnJd ?? findLunarReturnJD(
    natalMoon.longitude,
    buildJulianDay(params.targetDate, null, params.returnUtcOffsetMinutes),
    1,
  );

  // 3. Calculate full chart at that JD using return location
  const planets = calcPlanets(lunarReturnJd, params.enabledPlanets, zodiac);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));
  const { houses, angles } = calcHouses(lunarReturnJd, params.returnLat, params.returnLon, params.houseSystem, zodiac);
  computePartOfFortune(angles, planets);

  return {
    planets, houses, angles, aspects,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      calculatedAt: new Date().toISOString(),
      houseSystem: params.houseSystem,
      zodiacSystem: zodiac,
      julianDay: lunarReturnJd,
    },
  };
}

export function listLunarReturns(params: {
  birthDate: string; birthTime: string | null;
  utcOffsetMinutes: number;
  year: number;
  returnUtcOffsetMinutes: number;
}): { returns: { julianDay: number; datetime: string }[] } {
  const natalJd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const natalPlanets = calcPlanets(natalJd, ['MOON']);
  const natalMoon = natalPlanets.find(p => p.id === 'MOON');
  if (!natalMoon) throw new Error('Could not calculate natal Moon position');
  return {
    returns: listLunarReturnsInYear(
      natalMoon.longitude, params.year, params.returnUtcOffsetMinutes,
    ),
  };
}

const SIGN_NAMES_EPHEMERIS: readonly SignName[] = [
  'ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR',
  'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS',
];

const SLOW_PLANETS: Set<PlanetId> = new Set([
  'SUN', 'MERCURY', 'VENUS', 'MARS',
  'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
]);

const MAJOR_ASPECT_ANGLES: [AspectType, number][] = [
  ['CONJUNCTION', 0], ['OPPOSITION', 180], ['TRINE', 120], ['SQUARE', 90], ['SEXTILE', 60],
];

/** Normalize a degree difference to the half-open range (-180, 180]. */
function norm180(deg: number): number {
  return ((deg % 360) + 540) % 360 - 180;
}

/**
 * Refine the exact instant of an ephemeris event by bisecting a sign-changing
 * scalar `f` over the noon-to-noon bracket `[jdLo, jdHi]` that produced it.
 * Every event is detected as a state change between two noon-UTC samples, so its
 * root is always bracketed (`f(jdLo)` and `f(jdHi)` differ in sign); this walks
 * that bracket down to ~1-minute precision — far tighter than the 1-hour display
 * rounding the calendar needs. Returns the JD of the crossing.
 */
function refineEventJd(f: (jd: number) => number, jdLo: number, jdHi: number): number {
  let lo = jdLo;
  let hi = jdHi;
  let fLo = f(lo);
  const TOLERANCE_JD = 1 / 1440; // one minute
  for (let i = 0; i < 24 && hi - lo > TOLERANCE_JD; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (fMid === 0) return mid;
    if ((fLo < 0) === (fMid < 0)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** Ecliptic longitude of a single body at `jd` (one sweph call). */
function longitudeAt(jd: number, id: PlanetId, zodiac: ZodiacSystem): number {
  return calcPlanets(jd, [id], zodiac)[0].longitude;
}

/** Signed ecliptic speed of a single body at `jd` (one sweph call). */
function speedAt(jd: number, id: PlanetId, zodiac: ZodiacSystem): number {
  return calcPlanets(jd, [id], zodiac)[0].speed;
}

export function calculateEphemeris(params: {
  year: number;
  month: number;
  enabledPlanets?: PlanetId[];
  zodiacSystem?: ZodiacSystem;
}): EphemerisData {
  const { year, month } = params;
  const zodiac: ZodiacSystem = params.zodiacSystem ?? 'tropical';
  const daysInMonth = new Date(year, month, 0).getDate();

  const dailyPositions: PlanetPosition[][] = [];
  const dates: string[] = [];
  const jds: number[] = [];

  // Calculate positions for each day at noon UTC
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dates.push(dateStr);
    const jd = toJulianDay(year, month, day, 12);
    jds.push(jd);
    dailyPositions.push(calcPlanets(jd, params.enabledPlanets, zodiac));
  }

  // Detect events by comparing consecutive days
  const events: EphemerisEvent[] = [];

  for (let i = 0; i < dailyPositions.length - 1; i++) {
    const today = dailyPositions[i];
    const tomorrow = dailyPositions[i + 1];
    const date = dates[i + 1]; // event occurs on the later day
    const jdToday = jds[i];
    const jdTomorrow = jds[i + 1];

    for (const planet of today) {
      const next = tomorrow.find((p) => p.id === planet.id);
      if (!next) continue;

      // Ingress: sign changes
      if (planet.sign !== next.sign) {
        // The shared boundary is the 30°-multiple between the two signs: the new
        // sign's start when moving forward, the old sign's start when retrograde.
        const forward = (next.sign - planet.sign + 12) % 12 === 1;
        const boundary = (forward ? next.sign : planet.sign) * 30;
        const jdExact = refineEventJd(
          (jd) => norm180(longitudeAt(jd, planet.id, zodiac) - boundary),
          jdToday,
          jdTomorrow,
        );
        events.push({
          date,
          time: fromJulianDay(jdExact),
          type: 'INGRESS',
          planet: planet.id,
          detail: `${planet.id} enters ${SIGN_NAMES_EPHEMERIS[next.sign]}`,
        });
      }

      // Station retrograde: speed goes from positive to negative
      if (planet.speed >= 0 && next.speed < 0) {
        const jdExact = refineEventJd(
          (jd) => speedAt(jd, planet.id, zodiac),
          jdToday,
          jdTomorrow,
        );
        events.push({
          date,
          time: fromJulianDay(jdExact),
          type: 'STATION_RETROGRADE',
          planet: planet.id,
          detail: `${planet.id} stations retrograde`,
        });
      }

      // Station direct: speed goes from negative to positive
      if (planet.speed < 0 && next.speed >= 0) {
        const jdExact = refineEventJd(
          (jd) => speedAt(jd, planet.id, zodiac),
          jdToday,
          jdTomorrow,
        );
        events.push({
          date,
          time: fromJulianDay(jdExact),
          type: 'STATION_DIRECT',
          planet: planet.id,
          detail: `${planet.id} stations direct`,
        });
      }
    }

    // Exact aspects between slow planets
    for (let a = 0; a < today.length; a++) {
      if (!SLOW_PLANETS.has(today[a].id)) continue;
      for (let b = a + 1; b < today.length; b++) {
        if (!SLOW_PLANETS.has(today[b].id)) continue;

        const todayA = today[a];
        const todayB = today[b];
        const tomorrowA = tomorrow.find((p) => p.id === todayA.id);
        const tomorrowB = tomorrow.find((p) => p.id === todayB.id);
        if (!tomorrowA || !tomorrowB) continue;

        for (const [aspectType, exactAngle] of MAJOR_ASPECT_ANGLES) {
          for (const shifted of shiftedAnglesFor(exactAngle)) {
            const orbToday = signedAspectOrb(todayA.longitude, todayB.longitude, shifted);
            const orbTomorrow = signedAspectOrb(tomorrowA.longitude, tomorrowB.longitude, shifted);
            if (Math.abs(orbToday) <= 1.5 && orbToday * orbTomorrow < 0) {
              const jdExact = refineEventJd(
                (jd) => signedAspectOrb(
                  longitudeAt(jd, todayA.id, zodiac),
                  longitudeAt(jd, todayB.id, zodiac),
                  shifted,
                ),
                jdToday,
                jdTomorrow,
              );
              events.push({
                date,
                time: fromJulianDay(jdExact),
                type: 'EXACT_ASPECT',
                planet: todayA.id,
                detail: `${todayA.id} ${aspectType} ${todayB.id}`,
                targetPlanet: todayB.id,
                aspectType,
              });
            }
          }
        }
      }
    }
  }

  return {
    year, month,
    days: dates.map((date, i) => ({ date, planets: dailyPositions[i] })),
    events,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}

/**
 * Calendar of transit events (exact natal aspects, stations, sign/house
 * ingresses) over a date window of up to 366 days. Computes the natal chart
 * once, then delegates to the daily-sampling detector in
 * calculations/transit-events.ts.
 */
export function calculateTransitEvents(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
  zodiacSystem?: ZodiacSystem;
  enabledPlanets?: PlanetId[];
  startDate: string; endDate: string;
}): TransitEventsData {
  const natal = calculateNatal({
    birthDate: params.birthDate,
    birthTime: params.birthTime,
    lat: params.lat,
    lon: params.lon,
    utcOffsetMinutes: params.utcOffsetMinutes,
    houseSystem: params.houseSystem,
    zodiacSystem: params.zodiacSystem,
    enabledPlanets: params.enabledPlanets,
  });
  return computeTransitEvents({
    natal,
    startDate: params.startDate,
    endDate: params.endDate,
    zodiacSystem: params.zodiacSystem,
    enabledPlanets: params.enabledPlanets,
  });
}

export function calculateVocMoon(params: {
  year: number;
  month: number;
  zodiacSystem?: ZodiacSystem;
}): VocMoonData {
  const periods = calculateVocPeriods(params.year, params.month, params.zodiacSystem ?? 'tropical');
  return {
    year: params.year,
    month: params.month,
    periods,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}

export function calculateAstromap(params: {
  birthDate: string;
  birthTime: string;
  utcOffsetMinutes: number;
  enabledPlanets?: PlanetId[];
}): AstromapData {
  const jd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const requested = params.enabledPlanets ?? [...ASTROMAP_PLANETS];
  const planets = requested.filter((id) => (ASTROMAP_PLANETS as readonly PlanetId[]).includes(id));
  const lines = computeAstromapLines(jd, planets);
  const parans = computeAstromapParans(lines);
  return {
    lines,
    parans,
    meta: {
      // `parans` is an additive field — no schema-version bump (the app gates on
      // an exact SCHEMA_VERSION match shared across every endpoint).
      schemaVersion: SCHEMA_VERSION,
      calculatedAt: new Date().toISOString(),
      julianDay: jd,
      planetCount: planets.length,
    },
  };
}
