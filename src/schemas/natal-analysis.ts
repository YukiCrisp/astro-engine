import { z } from 'zod';
import { PlanetIdEnum, NatalChartDataSchema } from './responses.js';
import { NatalRequestSchema } from './natal.js';

export { NatalRequestSchema as NatalAnalysisRequestSchema };

const ChartPatternTypeEnum = z.enum([
  'BUNDLE', 'BOWL', 'BUCKET', 'SEESAW', 'LOCOMOTIVE', 'SPLASH', 'SPLAY',
]);

const ElementEnum = z.enum(['FIRE', 'EARTH', 'AIR', 'WATER']);
const ModalityEnum = z.enum(['CARDINAL', 'FIXED', 'MUTABLE']);
const PolarityEnum = z.enum(['MASCULINE', 'FEMININE']);
const QuadrantEnum = z.enum(['ANGULAR', 'SUCCEDENT', 'CADENT']);

const ChartAnalysisSchema = z.object({
  pattern: z.object({
    type: ChartPatternTypeEnum,
    handlePlanet: PlanetIdEnum.optional(),
    occupiedSigns: z.number().int(),
    span: z.number(),
  }),
  culminatingPlanet: PlanetIdEnum.nullable(),
  risingPlanet: PlanetIdEnum.nullable(),
  distribution: z.object({
    elements: z.record(ElementEnum, z.array(PlanetIdEnum)),
    modalities: z.record(ModalityEnum, z.array(PlanetIdEnum)),
    polarities: z.record(PolarityEnum, z.array(PlanetIdEnum)),
    quadrants: z.record(QuadrantEnum, z.array(PlanetIdEnum)),
  }),
});

export const NatalAnalysisResponseSchema = NatalChartDataSchema.extend({
  analysis: ChartAnalysisSchema,
});
