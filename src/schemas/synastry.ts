import { z } from 'zod';
import { NatalRequestSchema, EngineFilterSchema } from './natal.js';

export const SynastryRequestSchema = z.object({
  personA: NatalRequestSchema,
  personB: NatalRequestSchema,
}).merge(EngineFilterSchema);
export type SynastryRequest = z.infer<typeof SynastryRequestSchema>;
