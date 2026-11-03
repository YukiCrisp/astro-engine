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
  'PART_OF_FORTUNE', 'PART_OF_SPIRIT', 'PART_OF_EROS', 'PART_OF_NECESSITY',
  'PART_OF_COURAGE', 'PART_OF_VICTORY', 'PART_OF_NEMESIS', 'PART_OF_MARRIAGE',
]);

// Letters Swiss Ephemeris uses for each live in sweph-adapter.ts (HOUSE_SYSTEM_MAP).
const HouseSystemEnum = z.enum([
  'PLACIDUS', 'WHOLE_SIGN', 'KOCH', 'REGIOMONTANUS', 'CAMPANUS', 'EQUAL', 'PORPHYRY',
  'TOPOCENTRIC', 'ALCABITIUS', 'MORINUS', 'MERIDIAN', 'EQUAL_MC', 'VEHLOW',
]);

export { PlanetIdEnum, AspectTypeEnum, ArabicPartIdEnum, HouseSystemEnum };

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

export const ChartAnglesSchema = z.object({
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
    houseSystem: HouseSystemEnum,
    zodiacSystem: z.enum(['tropical', 'sidereal']).optional(),
    julianDay: z.number(),
    birthTimeAssumed: z.boolean().describe(
      'True when no clock time was supplied for this chart and local noon was assumed. `angles`, `houses`, every house placement derived from them and `arabicParts` are then products of that assumption rather than of the birth data — the ASC advances a full sign roughly every two hours, so an assumed-noon ASC lands on the true sign about one time in twelve. Testing `angles !== null` is NOT sufficient: the engine fills those fields in from the assumption, and this flag is the only thing that separates measured from assumed.',
    ),
    houseSystemFallback: z.enum(['PORPHYRY']).optional().describe(
      'Present when `houseSystem` could not be calculated at this latitude and the houses were computed with this system instead. Placidus and Koch have no solution inside the polar circles (beyond about 66.56° N/S), where Swiss Ephemeris substitutes Porphyry. Topocentric is given the same substitution there: Swiss Ephemeris still returns cusps for it, but they run out of order and the MC flips to the IC.',
    ),
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

// Davison: a real chart at the midpoint moment and place; `midpoint` says where and when.
export const DavisonChartSchema = NatalChartWithPatternsSchema.extend({
  midpoint: z.object({
    julianDay: z.number().describe('Julian Day (UT) halfway between the two births.'),
    lat: z.number().describe('Average of the two birth latitudes.'),
    lon: z.number().describe('Average of the two birth longitudes, taken the shorter way round the globe (-180 to 180).'),
  }),
});

// Solar arc: the natal-shaped fields keep their meaning (directed planets over
// the natal houses and angles); `arc` and `directedAngles` are additive.
export const SolarArcChartSchema = NatalChartWithPatternsSchema.extend({
  arc: z.number().describe('Solar arc in degrees: how far the progressed Sun has moved from the natal Sun (0–360).'),
  directedAngles: ChartAnglesSchema.nullable().describe(
    'The natal angles (ASC, MC, DSC, IC, vertex, east point, part of fortune) moved forward by `arc`. `angles` stays natal.',
  ),
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

export const DavisonTransitChartDataSchema = z.object({
  davison: DavisonChartSchema.omit({ aspectPatterns: true }),
  transit: NatalChartDataSchema,
  crossAspects: z.array(AspectSchema),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
  }),
});

export const SolarReturnTransitChartDataSchema = z.object({
  solarReturn: NatalChartDataSchema,
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
  time: z.string().optional(),
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
  context: z.object({
    sunSignAtStart: SignNameEnum,
    sunNatalHouseAtStart: z.number().int().min(1).max(12).nullable(),
    sunHemisphereAtStart: z.enum(['upper', 'lower']).nullable(),
  }),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
    birthTimeAssumed: z.boolean().describe(
      "Mirrors the natal chart's `meta.birthTimeAssumed`. HOUSE_INGRESS events and `context.sunNatalHouseAtStart` / `sunHemisphereAtStart` come from the natal houses, so when this is true they rest on an assumed local noon rather than on a known birth time.",
    ),
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

export const ForecastDataSchema = z.object({
  window: z.object({ startDate: z.string(), endDate: z.string() }),
  method: z.enum(['transit', 'progressed']),
  rows: z.array(z.object({
    mover: PlanetIdEnum,
    target: z.union([PlanetIdEnum, z.enum(['ASC', 'MC'])]),
    aspect: z.enum(['CONJUNCTION', 'OPPOSITION', 'TRINE', 'SQUARE', 'SEXTILE']),
    angle: z.number().describe('Shifted exact angle: the mover is this far ahead of the target at the exact (90 waxing square, 270 waning)'),
    segments: z.array(z.object({ enter: z.string(), leave: z.string() })).describe('Stretches inside the orb (UT ISO)'),
    openStart: z.boolean().describe('The first stretch was still inside the orb at the start of the search'),
    openEnd: z.boolean().describe('The last stretch was still inside the orb at the end of the search'),
    exacts: z.array(z.object({ at: z.string(), retrograde: z.boolean() })).describe('Exact moments (UT ISO)'),
    closest: z.object({ at: z.string(), orb: z.number() }),
  })),
  meta: z.object({
    schemaVersion: z.number(),
    calculatedAt: z.string(),
    birthTimeAssumed: z.boolean().describe("Mirrors the natal chart's `meta.birthTimeAssumed`. When true, ASC / MC were left out and the natal Moon sits at an assumed noon."),
  }),
});
