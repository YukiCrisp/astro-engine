export const SCHEMA_VERSION = 1;

export type PlanetId =
  | 'SUN' | 'MOON' | 'MERCURY' | 'VENUS' | 'MARS'
  | 'JUPITER' | 'SATURN' | 'URANUS' | 'NEPTUNE' | 'PLUTO'
  | 'TRUE_NODE' | 'CHIRON';

export type HouseSystem = 'PLACIDUS' | 'WHOLE_SIGN';

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
  degree: number;
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
}

export interface Aspect {
  planetA: PlanetId;
  planetB: PlanetId;
  type: AspectType;
  angle: number;
  orb: number;
  applying: boolean;
}

export interface NatalChartData {
  planets: PlanetPosition[];
  houses: HouseCusp[] | null;
  angles: ChartAngles | null;
  aspects: Aspect[];
  meta: {
    schemaVersion: number;
    calculatedAt: string;
    houseSystem: HouseSystem;
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
