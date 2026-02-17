import { calcPlanets, calcHouses } from './sweph-adapter.js';
import { detectAspects, detectCrossAspects } from './calculations/aspects.js';
import type { AspectConfig } from './calculations/aspects.js';
import { getProgressedJulianDay } from './calculations/progressions.js';
import { midpointLongitude } from './calculations/composite.js';
import { calculateVocPeriods } from './calculations/voc-moon.js';
import { buildJulianDay, toJulianDay } from '../utils/date.js';
import { SCHEMA_VERSION } from './types.js';
import type {
  NatalChartData, HouseSystem, TripleChartData,
  SynastryChartData, EphemerisData, EphemerisEvent,
  VocMoonData,
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

export function calculateNatal(params: {
  birthDate: string; birthTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
} & EngineFilterParams): NatalChartData {
  const jd = buildJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes);
  const planets = calcPlanets(jd, params.enabledPlanets);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));

  if (params.birthTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
    };
  }

  const { houses, angles } = calcHouses(jd, params.lat, params.lon, params.houseSystem);
  computePartOfFortune(angles, planets);
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
} & EngineFilterParams): NatalChartData {
  const jd = getProgressedJulianDay(params.birthDate, params.birthTime, params.utcOffsetMinutes, params.progressedDate);
  const planets = calcPlanets(jd, params.enabledPlanets);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));

  if (params.birthTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
    };
  }

  const houseLat = params.relocatedLat ?? params.lat;
  const houseLon = params.relocatedLon ?? params.lon;
  const { houses, angles } = calcHouses(jd, houseLat, houseLon, params.houseSystem);
  computePartOfFortune(angles, planets);
  return {
    planets, houses, angles, aspects,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
  };
}

export function calculateTransit(params: {
  transitDate: string; transitTime: string | null;
  lat: number; lon: number;
  utcOffsetMinutes: number; houseSystem: HouseSystem;
} & EngineFilterParams): NatalChartData {
  const jd = buildJulianDay(params.transitDate, params.transitTime, params.utcOffsetMinutes);
  const planets = calcPlanets(jd, params.enabledPlanets);
  const aspects = detectAspects(planets, 1, toAspectConfig(params));

  if (params.transitTime === null) {
    return {
      planets, houses: null, angles: null, aspects,
      meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString(), houseSystem: params.houseSystem, julianDay: jd },
    };
  }

  const { houses, angles } = calcHouses(jd, params.lat, params.lon, params.houseSystem);
  computePartOfFortune(angles, planets);
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
      natalToProgressed: detectCrossAspects(natal.planets, progressed.planets, aspectConfig),
      natalToTransit: detectCrossAspects(natal.planets, transit.planets, aspectConfig),
      progressedToTransit: detectCrossAspects(progressed.planets, transit.planets, aspectConfig),
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
    return {
      id: pA.id,
      longitude: lon,
      latitude: lat,
      speed,
      isRetrograde: speed < 0,
      sign,
      signName: SIGN_NAMES[sign],
      degree: lon % 30,
    };
  });

  const aspects = detectAspects(planets, 1, toAspectConfig(filterParams));

  // Composite houses: use midpoint ASC and midpoint lat/lon
  const midLat = (params.personA.lat + params.personB.lat) / 2;
  const midLon = midpointLongitude(params.personA.lon, params.personB.lon);

  if (chartA.angles && chartB.angles && params.personA.birthTime !== null && params.personB.birthTime !== null) {
    const compositeAsc = midpointLongitude(chartA.angles.asc, chartB.angles.asc);
    const compositeMc = midpointLongitude(chartA.angles.mc, chartB.angles.mc);

    // Use the midpoint JD for house calculation
    const jdA = chartA.meta.julianDay;
    const jdB = chartB.meta.julianDay;
    const midJd = (jdA + jdB) / 2;

    const { houses } = calcHouses(midJd, midLat, midLon, params.personA.houseSystem);

    const angles: import('./types.js').ChartAngles = {
      asc: compositeAsc,
      mc: compositeMc,
      dsc: (compositeAsc + 180) % 360,
      ic: (compositeMc + 180) % 360,
      vertex: chartA.angles && chartB.angles ? midpointLongitude(chartA.angles.vertex, chartB.angles.vertex) : 0,
      eastPoint: chartA.angles && chartB.angles ? midpointLongitude(chartA.angles.eastPoint, chartB.angles.eastPoint) : 0,
      partOfFortune: 0,
    };
    computePartOfFortune(angles, planets);

    return {
      planets, houses, angles, aspects,
      meta: {
        schemaVersion: SCHEMA_VERSION,
        calculatedAt: new Date().toISOString(),
        houseSystem: params.personA.houseSystem,
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
      julianDay: 0,
    },
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

export function calculateEphemeris(params: {
  year: number;
  month: number;
  enabledPlanets?: PlanetId[];
}): EphemerisData {
  const { year, month } = params;
  const daysInMonth = new Date(year, month, 0).getDate();

  const dailyPositions: PlanetPosition[][] = [];
  const dates: string[] = [];

  // Calculate positions for each day at noon UTC
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dates.push(dateStr);
    const jd = toJulianDay(year, month, day, 12);
    dailyPositions.push(calcPlanets(jd, params.enabledPlanets));
  }

  // Detect events by comparing consecutive days
  const events: EphemerisEvent[] = [];

  for (let i = 0; i < dailyPositions.length - 1; i++) {
    const today = dailyPositions[i];
    const tomorrow = dailyPositions[i + 1];
    const date = dates[i + 1]; // event occurs on the later day

    for (const planet of today) {
      const next = tomorrow.find((p) => p.id === planet.id);
      if (!next) continue;

      // Ingress: sign changes
      if (planet.sign !== next.sign) {
        events.push({
          date,
          type: 'INGRESS',
          planet: planet.id,
          detail: `${planet.id} enters ${SIGN_NAMES_EPHEMERIS[next.sign]}`,
        });
      }

      // Station retrograde: speed goes from positive to negative
      if (planet.speed >= 0 && next.speed < 0) {
        events.push({
          date,
          type: 'STATION_RETROGRADE',
          planet: planet.id,
          detail: `${planet.id} stations retrograde`,
        });
      }

      // Station direct: speed goes from negative to positive
      if (planet.speed < 0 && next.speed >= 0) {
        events.push({
          date,
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

        const distToday = angularDist(todayA.longitude, todayB.longitude);
        const distTomorrow = angularDist(tomorrowA.longitude, tomorrowB.longitude);

        for (const [aspectType, exactAngle] of MAJOR_ASPECT_ANGLES) {
          const orbToday = distToday - exactAngle;
          const orbTomorrow = distTomorrow - exactAngle;
          // Check if orb crosses zero (sign change in orb)
          if (Math.abs(orbToday) <= 1.5 && orbToday * orbTomorrow < 0) {
            events.push({
              date,
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

  return {
    year, month,
    days: dates.map((date, i) => ({ date, planets: dailyPositions[i] })),
    events,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}

function angularDist(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function calculateVocMoon(params: {
  year: number;
  month: number;
}): VocMoonData {
  const periods = calculateVocPeriods(params.year, params.month);
  return {
    year: params.year,
    month: params.month,
    periods,
    meta: { schemaVersion: SCHEMA_VERSION, calculatedAt: new Date().toISOString() },
  };
}
