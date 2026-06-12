import { z } from 'zod';
import { NatalRequestSchema, EngineFilterSchema } from './natal.js';
import { TransitRequestSchema } from './transit.js';

export const CompositeTransitRequestSchema = z.object({
  personA: NatalRequestSchema,
  personB: NatalRequestSchema,
  transit: TransitRequestSchema,
}).merge(EngineFilterSchema);
export type CompositeTransitRequest = z.infer<typeof CompositeTransitRequestSchema>;
