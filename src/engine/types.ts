export const SCHEMA_VERSION = 1;

export type PlanetId =
  | 'SUN' | 'MOON' | 'MERCURY' | 'VENUS' | 'MARS'
  | 'JUPITER' | 'SATURN' | 'URANUS' | 'NEPTUNE' | 'PLUTO'
  | 'TRUE_NODE' | 'CHIRON'
  | 'MEAN_NODE' | 'MEAN_LILITH' | 'TRUE_LILITH'
  | 'PHOLUS' | 'CERES' | 'PALLAS' | 'JUNO' | 'VESTA';

export type SignName =
  | 'ARI' | 'TAU' | 'GEM' | 'CAN' | 'LEO' | 'VIR'
  | 'LIB' | 'SCO' | 'SAG' | 'CAP' | 'AQU' | 'PIS';

export type HouseSystem = 'PLACIDUS' | 'WHOLE_SIGN' | 'KOCH' | 'REGIOMONTANUS' | 'CAMPANUS' | 'EQUAL' | 'PORPHYRY';

export type ZodiacSystem = 'tropical' | 'sidereal';

export type AspectType =
  | 'CONJUNCTION' | 'OPPOSITION' | 'TRINE' | 'SQUARE' | 'SEXTILE'
  | 'QUINCUNX' | 'SEMISEXTILE' | 'SEMISQUARE' | 'SESQUIQUADRATE' | 'QUINTILE';

export interface PlanetPosition {
  id: PlanetId;
  longitude: number;
  latitude: number;
  speed: number;
  isRetrograde: boolean;
  sign: number;
  signName: SignName;
  degree: number;
  declination: number;
}

export interface HouseCusp {
  house: number;
  longitude: number;
}

export interface ChartAngles {
  asc: number;
  mc: number;
  dsc: number;
  ic: number;
  vertex: number;
  eastPoint: number;
  partOfFortune: number;
}

export interface Aspect {
  planetA: PlanetId;
  planetB: PlanetId;
  type: AspectType;
  angle: number;
  orb: number;
  /** Undefined when the aspect's context has no time evolution (synastry, composite). */
  applying?: boolean;
}

export type ArabicPartId = 'PART_OF_FORTUNE' | 'PART_OF_SPIRIT' | 'PART_OF_EROS' | 'PART_OF_MARRIAGE';

export interface ArabicPartResult {
  id: ArabicPartId;
  name: string;
  longitude: number;
  sign: SignName;
  signDegree: number;
}

export interface FixedStar {
  name: string;
  longitude: number;
  latitude: number;
  sign: string;
  signDegree: number;
}

export interface NatalChartData {
  planets: PlanetPosition[];
  houses: HouseCusp[] | null;
  angles: ChartAngles | null;
  aspects: Aspect[];
  arabicParts?: ArabicPartResult[];
  fixedStars?: FixedStar[];
  meta: {
    schemaVersion: number;
    calculatedAt: string;
    houseSystem: HouseSystem;
    zodiacSystem?: ZodiacSystem;
    julianDay: number;
  };
}

export interface TripleChartData {
  natal: NatalChartData;
  progressed: NatalChartData;
  transit: NatalChartData;
  crossAspects: {
    natalToProgressed: Aspect[];
    natalToTransit: Aspect[];
    progressedToTransit: Aspect[];
  };
  meta: {
    schemaVersion: number;
    calculatedAt: string;
  };
}

export interface SynastryChartData {
  personA: NatalChartData;
  personB: NatalChartData;
  crossAspects: Aspect[];
  meta: {
    schemaVersion: number;
    calculatedAt: string;
  };
}

export interface EphemerisDay {
  date: string;
  planets: PlanetPosition[];
}

export type EphemerisEventType = 'INGRESS' | 'STATION_RETROGRADE' | 'STATION_DIRECT' | 'EXACT_ASPECT';

export interface EphemerisEvent {
  date: string;
  type: EphemerisEventType;
  planet: PlanetId;
  detail: string;
  targetPlanet?: PlanetId;
  aspectType?: AspectType;
}

export interface EphemerisData {
  year: number;
  month: number;
  days: EphemerisDay[];
  events: EphemerisEvent[];
  meta: {
    schemaVersion: number;
    calculatedAt: string;
  };
}

export interface VocMoonPeriod {
  start: string;
  end: string;
  lastAspectPlanet: PlanetId;
  lastAspectType: AspectType;
  endSign: SignName;
}

export interface VocMoonData {
  year: number;
  month: number;
  periods: VocMoonPeriod[];
  meta: {
    schemaVersion: number;
    calculatedAt: string;
  };
}
