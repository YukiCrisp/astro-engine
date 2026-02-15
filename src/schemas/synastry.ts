import { z } from 'zod';
import { NatalRequestSchema } from './natal.js';

export const SynastryRequestSchema = z.object({
  personA: NatalRequestSchema,
  personB: NatalRequestSchema,
});
export type SynastryRequest = z.infer<typeof SynastryRequestSchema>;
