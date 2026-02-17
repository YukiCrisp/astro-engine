import { z } from 'zod';
import { PlanetIdEnum } from './responses.js';

export const EphemerisRequestSchema = z.object({
  year: z.number().int().min(1800).max(2400).describe('Year').meta({ example: 2026 }),
  month: z.number().int().min(1).max(12).describe('Month (1-12)').meta({ example: 2 }),
  enabledPlanets: z.array(PlanetIdEnum).optional().describe('Only compute these planets'),
});
export type EphemerisRequest = z.infer<typeof EphemerisRequestSchema>;
