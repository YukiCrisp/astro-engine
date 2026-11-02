import { z } from 'zod';
import { NatalRequestSchema, EngineFilterSchema } from './natal.js';
import { TransitRequestSchema } from './transit.js';

export const DavisonTransitRequestSchema = z.object({
  personA: NatalRequestSchema,
  personB: NatalRequestSchema,
  transit: TransitRequestSchema,
}).merge(EngineFilterSchema);
export type DavisonTransitRequest = z.infer<typeof DavisonTransitRequestSchema>;
