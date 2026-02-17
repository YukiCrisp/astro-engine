import { z } from 'zod';
import { NatalRequestSchema, EngineFilterSchema } from './natal.js';

export const CompositeRequestSchema = z.object({
  personA: NatalRequestSchema,
  personB: NatalRequestSchema,
}).merge(EngineFilterSchema);
export type CompositeRequest = z.infer<typeof CompositeRequestSchema>;
