import { z } from 'zod';
import { NatalRequestSchema } from './natal.js';
import { TransitRequestSchema } from './transit.js';

export const TripleRequestSchema = z.object({
  natal: NatalRequestSchema,
  progressed: z.object({
    progressedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    relocatedLat: z.number().min(-90).max(90).optional(),
    relocatedLon: z.number().min(-180).max(180).optional(),
  }),
  transit: TransitRequestSchema,
  computeCrossAspects: z.boolean().default(true),
});
export type TripleRequest = z.infer<typeof TripleRequestSchema>;
