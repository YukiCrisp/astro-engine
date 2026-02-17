import { z } from 'zod';
import { NatalRequestSchema, EngineFilterSchema } from './natal.js';
import { TransitRequestSchema } from './transit.js';

export const TripleRequestSchema = z.object({
  natal: NatalRequestSchema,
  progressed: z.object({
    progressedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Target date for secondary progressions').meta({ example: '2025-06-15' }),
    relocatedLat: z.number().min(-90).max(90).optional().describe('Relocated latitude (optional)'),
    relocatedLon: z.number().min(-180).max(180).optional().describe('Relocated longitude (optional)'),
  }),
  transit: TransitRequestSchema,
  computeCrossAspects: z.boolean().default(true).describe('Whether to compute cross-chart aspects'),
}).merge(EngineFilterSchema);
export type TripleRequest = z.infer<typeof TripleRequestSchema>;
