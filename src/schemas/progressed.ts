import { z } from 'zod';
import { NatalRequestSchema } from './natal.js';

export const ProgressedRequestSchema = NatalRequestSchema.extend({
  progressedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  relocatedLat: z.number().min(-90).max(90).optional(),
  relocatedLon: z.number().min(-180).max(180).optional(),
});
export type ProgressedRequest = z.infer<typeof ProgressedRequestSchema>;
