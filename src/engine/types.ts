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

export interface CompositeTransitChartData {
  /** Midpoint composite chart of the two persons. */
  composite: NatalChartData;
  /** Transiting positions for the requested moment. */
  transit: NatalChartData;
  /** Aspects from composite planets to transiting planets (applying meaningful — transit moves). */
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
  /**
   * Exact instant the event becomes true (ingress reaches 0° of the new sign,
   * station speed hits zero, aspect orb crosses exact), as a UTC ISO-8601
   * timestamp (`YYYY-MM-DDTHH:MM:SSZ`). The daily engine samples at noon UTC and
   * records `date` as the later bracket day; `time` refines that bracket to the
   * true moment via root-finding. Optional so the field is additive — older
   * clients ignore it and keep the all-day behavior (no schema-version bump).
   */
  time?: string;
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

/** Major aspects considered for transit-to-natal exact hits. */
export type TransitEventAspectType = 'CONJUNCTION' | 'OPPOSITION' | 'TRINE' | 'SQUARE' | 'SEXTILE';

export type TransitEvent =
  | {
      date: string; kind: 'NATAL_ASPECT'; transiting: PlanetId;
      /** PlanetId or 'ASC' | 'MC' */
      natal: string;
      aspectType: TransitEventAspectType; detail: string;
    }
  | { date: string; kind: 'STATION_RETROGRADE' | 'STATION_DIRECT'; transiting: PlanetId; detail: string }
  | { date: string; kind: 'SIGN_INGRESS'; transiting: PlanetId; sign: SignName; detail: string }
  | { date: string; kind: 'HOUSE_INGRESS'; transiting: PlanetId; house: number; detail: string };

export interface TransitEventsData {
  window: { startDate: string; endDate: string; days: number };
  events: TransitEvent[];
  /**
   * Always-present structural context so a report has a spine even when the
   * event list is thin: where the transiting Sun sits at the window start.
   * House/hemisphere are null when birth time (and thus houses) is unknown.
   */
  context: {
    sunSignAtStart: SignName;
    sunNatalHouseAtStart: number | null;
    sunHemisphereAtStart: 'upper' | 'lower' | null;
  };
  meta: {
    schemaVersion: number;
    calculatedAt: string;
    truncated: boolean;
    totalDetected: number;
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

export type AstromapLineType = 'MC' | 'IC' | 'AC' | 'DC';

export interface AstromapPoint {
  lon: number;
  lat: number;
}

export interface AstromapLine {
  planetId: PlanetId;
  lineType: AstromapLineType;
  points: AstromapPoint[];
}

export interface AstromapData {
  lines: AstromapLine[];
  parans: import('./calculations/astrocartography.js').ParanCrossing[];
  meta: {
    schemaVersion: number;
    calculatedAt: string;
    julianDay: number;
    planetCount: number;
  };
}
