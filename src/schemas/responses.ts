import { z } from 'zod';

const PlanetIdEnum = z.enum([
  'SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
  'TRUE_NODE', 'CHIRON',
  'MEAN_NODE', 'MEAN_LILITH', 'TRUE_LILITH',
  'PHOLUS', 'CERES', 'PALLAS', 'JUNO', 'VESTA',
]);

const AspectTypeEnum = z.enum([
  'CONJUNCTION', 'OPPOSITION', 'TRINE', 'SQUARE', 'SEXTILE',
  'QUINCUNX', 'SEMISEXTILE', 'SEMISQUARE', 'SESQUIQUADRATE', 'QUINTILE',
]);

const ArabicPartIdEnum = z.enum([
  'PART_OF_FORTUNE', 'PART_OF_SPIRIT', 'PART_OF_EROS', 'PART_OF_MARRIAGE',
]);

export { PlanetIdEnum, AspectTypeEnum, ArabicPartIdEnum };

const PlanetPositionSchema = z.object({
  id: PlanetIdEnum,
  longitude: z.number(),
  latitude: z.number(),
  speed: z.number(),
  isRetrograde: z.boolean(),
  sign: z.number().int().min(0).max(11),
  signName: z.enum(['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS']),
  degree: z.number(),
  declination: z.number(),
});

const HouseCuspSchema = z.object({
  house: z.number().int().min(1).max(12),
  longitude: z.number(),
});

const ChartAnglesSchema = z.object({
  asc: z.number(),
  mc: z.number(),
  dsc: z.number(),
  ic: z.number(),
  vertex: z.number(),
  eastPoint: z.number(),
  partOfFortune: z.number(),
});

const AspectSchema = z.object({
  planetA: PlanetIdEnum,
  planetB: PlanetIdEnum,
  type: AspectTypeEnum,
  angle: z.number(),
  orb: z.number(),
  applying: z.boolean().optional(),
});

const ArabicPartResultSchema = z.object({
  id: ArabicPartIdEnum,
  name: z.string(),
  longitude: z.number(),
  sign: z.enum(['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS']),
  signDegree: z.number(),
});

const FixedStarSchema = z.object({
  name: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  sign: z.string(),
  signDegree: z.number(),
});

export const NatalChartDataSchema = z.object({
  planets: z.array(PlanetPositionSchema),
  houses: z.array(HouseCuspSchema).nullable(),
  angles: ChartAnglesSchema.nullable(),
  aspects: z.array(AspectSchema),
  arabicParts: z.array(ArabicPartResultSchema).optional(),
  fixedStars: z.array(FixedStarSchema).optional(),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
    houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN', 'KOCH', 'REGIOMONTANUS', 'CAMPANUS', 'EQUAL', 'PORPHYRY']),
    zodiacSystem: z.enum(['tropical', 'sidereal']).optional(),
    julianDay: z.number(),
  }),
});

// --- Special aspect patterns (grand trine, T-square, etc.) ---
// Shared by the natal-analysis response and the single derived charts
// (composite / progressed / solar-arc / solar/lunar return / transit).
export const ElementEnum = z.enum(['FIRE', 'EARTH', 'AIR', 'WATER']);
export const ModalityEnum = z.enum(['CARDINAL', 'FIXED', 'MUTABLE']);
export const AspectPatternTypeEnum = z.enum([
  'STELLIUM', 'GRAND_TRINE', 'T_SQUARE', 'GRAND_CROSS', 'YOD', 'KITE',
]);

export const AspectPatternSchema = z.object({
  type: AspectPatternTypeEnum,
  planets: z.array(PlanetIdEnum),
  apex: PlanetIdEnum.optional(),
  element: ElementEnum.optional(),
  modality: ModalityEnum.optional(),
  sign: z.number().int().min(0).max(11).optional(),
  house: z.number().int().min(1).max(12).optional(),
  strong: z.boolean().optional(),
  orbAvg: z.number(),
});

// A single chart whose own geometry carries special aspect patterns.
export const NatalChartWithPatternsSchema = NatalChartDataSchema.extend({
  aspectPatterns: z.array(AspectPatternSchema),
});

export const TripleChartDataSchema = z.object({
  natal: NatalChartDataSchema,
  progressed: NatalChartDataSchema,
  transit: NatalChartDataSchema,
  crossAspects: z.object({
    natalToProgressed: z.array(AspectSchema),
    natalToTransit: z.array(AspectSchema),
    progressedToTransit: z.array(AspectSchema),
  }),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
  }),
});

export const SynastryChartDataSchema = z.object({
  personA: NatalChartDataSchema,
  personB: NatalChartDataSchema,
  crossAspects: z.array(AspectSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
  }),
});

export const CompositeTransitChartDataSchema = z.object({
  composite: NatalChartDataSchema,
  transit: NatalChartDataSchema,
  crossAspects: z.array(AspectSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
  }),
});

const EphemerisDaySchema = z.object({
  date: z.string(),
  planets: z.array(PlanetPositionSchema),
});

const EphemerisEventSchema = z.object({
  date: z.string(),
  type: z.enum(['INGRESS', 'STATION_RETROGRADE', 'STATION_DIRECT', 'EXACT_ASPECT']),
  planet: PlanetIdEnum,
  detail: z.string(),
  targetPlanet: PlanetIdEnum.optional(),
  aspectType: AspectTypeEnum.optional(),
});

export const EphemerisDataSchema = z.object({
  year: z.number(),
  month: z.number(),
  days: z.array(EphemerisDaySchema),
  events: z.array(EphemerisEventSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
  }),
});

// --- Transit events (window calendar for AI report generation) ---

const SignNameEnum = z.enum(['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS']);
const TransitEventAspectTypeEnum = z.enum(['CONJUNCTION', 'OPPOSITION', 'TRINE', 'SQUARE', 'SEXTILE']);

const TransitEventSchema = z.discriminatedUnion('kind', [
  z.object({
    date: z.string(),
    kind: z.literal('NATAL_ASPECT'),
    transiting: PlanetIdEnum,
    natal: z.string().describe("PlanetId or 'ASC' | 'MC'"),
    aspectType: TransitEventAspectTypeEnum,
    detail: z.string(),
  }),
  z.object({
    date: z.string(),
    kind: z.literal('STATION_RETROGRADE'),
    transiting: PlanetIdEnum,
    detail: z.string(),
  }),
  z.object({
    date: z.string(),
    kind: z.literal('STATION_DIRECT'),
    transiting: PlanetIdEnum,
    detail: z.string(),
  }),
  z.object({
    date: z.string(),
    kind: z.literal('SIGN_INGRESS'),
    transiting: PlanetIdEnum,
    sign: SignNameEnum,
    detail: z.string(),
  }),
  z.object({
    date: z.string(),
    kind: z.literal('HOUSE_INGRESS'),
    transiting: PlanetIdEnum,
    house: z.number().int().min(1).max(12),
    detail: z.string(),
  }),
]);

export const TransitEventsDataSchema = z.object({
  window: z.object({
    startDate: z.string(),
    endDate: z.string(),
    days: z.number().int(),
  }),
  events: z.array(TransitEventSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
    truncated: z.boolean(),
    totalDetected: z.number().int(),
  }),
});

const VocMoonPeriodSchema = z.object({
  start: z.string(),
  end: z.string(),
  lastAspectPlanet: PlanetIdEnum,
  lastAspectType: AspectTypeEnum,
  endSign: z.enum(['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS']),
});

export const VocMoonDataSchema = z.object({
  year: z.number(),
  month: z.number(),
  periods: z.array(VocMoonPeriodSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
  }),
});

export const AstromapLineTypeEnum = z.enum(['MC', 'IC', 'AC', 'DC']);

const AstromapPointSchema = z.object({
  lon: z.number(),
  lat: z.number(),
});

const AstromapLineSchema = z.object({
  planetId: PlanetIdEnum,
  lineType: AstromapLineTypeEnum,
  points: z.array(AstromapPointSchema),
});

export const ParanCrossingSchema = z.object({
  planetA: PlanetIdEnum,
  lineA: AstromapLineTypeEnum,
  planetB: PlanetIdEnum,
  lineB: AstromapLineTypeEnum,
  lat: z.number(),
  lon: z.number(),
});

export const AstromapDataSchema = z.object({
  lines: z.array(AstromapLineSchema),
  parans: z.array(ParanCrossingSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
    julianDay: z.number(),
    planetCount: z.number().int(),
  }),
});
