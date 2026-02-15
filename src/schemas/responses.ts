import { z } from 'zod';

const PlanetPositionSchema = z.object({
  id: z.enum(['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'TRUE_NODE', 'CHIRON']),
  longitude: z.number(),
  latitude: z.number(),
  speed: z.number(),
  isRetrograde: z.boolean(),
  sign: z.number().int().min(0).max(11),
  signName: z.enum(['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS']),
  degree: z.number(),
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
});

const AspectSchema = z.object({
  planetA: z.enum(['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'TRUE_NODE', 'CHIRON']),
  planetB: z.enum(['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'TRUE_NODE', 'CHIRON']),
  type: z.enum(['CONJUNCTION', 'OPPOSITION', 'TRINE', 'SQUARE', 'SEXTILE', 'QUINCUNX', 'SEMISEXTILE', 'SEMISQUARE', 'SESQUIQUADRATE', 'QUINTILE']),
  angle: z.number(),
  orb: z.number(),
  applying: z.boolean(),
});

export const NatalChartDataSchema = z.object({
  planets: z.array(PlanetPositionSchema),
  houses: z.array(HouseCuspSchema).nullable(),
  angles: ChartAnglesSchema.nullable(),
  aspects: z.array(AspectSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
    houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN']),
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
  planet: z.enum(['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'TRUE_NODE', 'CHIRON']),
  detail: z.string(),
  targetPlanet: z.enum(['SUN', 'MOON', 'MERCURY', 'VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'TRUE_NODE', 'CHIRON']).optional(),
  aspectType: z.enum(['CONJUNCTION', 'OPPOSITION', 'TRINE', 'SQUARE', 'SEXTILE', 'QUINCUNX', 'SEMISEXTILE', 'SEMISQUARE', 'SESQUIQUADRATE', 'QUINTILE']).optional(),
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
