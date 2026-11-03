import { z } from 'zod';
import { NatalRequestSchema, EngineFilterSchema } from './natal.js';

export const DavisonRequestSchema = z.object({
  personA: NatalRequestSchema,
  personB: NatalRequestSchema,
}).merge(EngineFilterSchema);
export type DavisonRequest = z.infer<typeof DavisonRequestSchema>;
