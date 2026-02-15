import { z } from 'zod';
import { NatalRequestSchema } from './natal.js';

export const CompositeRequestSchema = z.object({
  personA: NatalRequestSchema,
  personB: NatalRequestSchema,
});
export type CompositeRequest = z.infer<typeof CompositeRequestSchema>;
