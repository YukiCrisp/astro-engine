import { calcPlanets, calcHouses } from './sweph-adapter.js';
import { detectAspects, detectCrossAspects } from './calculations/aspects.js';
import { getProgressedJulianDay } from './calculations/progressions.js';
import { buildJulianDay } from '../utils/date.js';
import { SCHEMA_VERSION } from './types.js';
import type { NatalChartData, HouseSystem, TripleChartData } from './types.js';

export function calculateNatal(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
}): NatalChartData {
  const jd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const planets = calcPlanets(jd);
  const aspects = detectAspects(planets);

  if (params.birthTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
    };
  }

  const { houses, angles } = calcHouses(jd, params.lat, params.lon, params.houseSystem);
  return {
    planets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
  };
}

export function calculateProgressed(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
  progressedDate: string;
  relocatedLat?: number; relocatedLon?: number;
}): NatalChartData {
  const jd = getProgressedJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes, params.progressedDate);
  const planets = calcPlanets(jd);
  const aspects = detectAspects(planets);

  if (params.birthTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
    };
  }

  const houseLat = params.relocatedLat ?? params.lat;
  const houseLon = params.relocatedLon ?? params.lon;
  const { houses, angles } = calcHouses(jd, houseLat, houseLon, params.houseSystem);
  return {
    planets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
  };
}

export function calculateTransit(params: {
  transitDate: string; transitTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
}): NatalChartData {
  const jd = buildJulianDay(params.transitDate, params.transitTime, params.utcOffsetMinutes);
  const planets = calcPlanets(jd);
  const aspects = detectAspects(planets);

  if (params.transitTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
    };
  }

  const { houses, angles } = calcHouses(jd, params.lat, params.lon, params.houseSystem);
  return {
    planets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
  };
}

export function calculateTriple(params: {
  natal: Parameters<typeof calculateNatal>[0];
  progressedDate: string;
  transit: Parameters<typeof calculateTransit>[0];
  computeCrossAspects: boolean;
}): TripleChartData {
  const natal = calculateNatal(params.natal);
  const progressed = calculateProgressed({ ...params.natal, progressedDate: params.progressedDate });
  const transit = calculateTransit(params.transit);
  return {
    natal, progressed, transit,
    crossAspects: params.computeCrossAspects ? {
      natalToProgressed: detectCrossAspects(natal.planets, progressed.planets),
      natalToTransit: detectCrossAspects(natal.planets, transit.planets),
      progressedToTransit: detectCrossAspects(progressed.planets, transit.planets),
    } : { natalToProgressed: [], natalToTransit: [], progressedToTransit: [] },
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}
