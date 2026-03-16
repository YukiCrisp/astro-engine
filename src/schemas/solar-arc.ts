import { z } from 'zod';
import { NatalRequestSchema } from './natal.js';

export const SolarArcRequestSchema = NatalRequestSchema.extend({
  progressedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Target date for solar arc directions').meta({ example: '2025-06-15' }),
});

export type SolarArcRequest = z.infer<typeof SolarArcRequestSchema>;
