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

export const AstromapDataSchema = z.object({
  lines: z.array(AstromapLineSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
    julianDay: z.number(),
    planetCount: z.number().int(),
  }),
});
