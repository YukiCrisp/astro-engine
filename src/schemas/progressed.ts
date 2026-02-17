import { z } from 'zod';
import { NatalRequestSchema } from './natal.js';

export const ProgressedRequestSchema = NatalRequestSchema.extend({
  progressedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Target date for secondary progressions').meta({ example: '2025-06-15' }),
  relocatedLat: z.number().min(-90).max(90).optional().describe('Relocated latitude (optional)'),
  relocatedLon: z.number().min(-180).max(180).optional().describe('Relocated longitude (optional)'),
}); // inherits filter fields from NatalRequestSchema
export type ProgressedRequest = z.infer<typeof ProgressedRequestSchema>;
