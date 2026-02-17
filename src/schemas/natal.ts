import { z } from 'zod';
import { PlanetIdEnum, AspectTypeEnum } from './responses.js';

export const EngineFilterSchema = z.object({
  enabledPlanets: z.array(PlanetIdEnum).optional().describe('Only compute these planets'),
  enabledAspects: z.array(AspectTypeEnum).optional().describe('Only detect these aspect types'),
  aspectOrbs: z.record(z.string(), z.number()).optional().describe('Override orb per aspect type'),
  sunOrbBonus: z.number().optional().describe('Extra orb for Sun aspects'),
  moonOrbBonus: z.number().optional().describe('Extra orb for Moon aspects'),
});

export const NatalRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Birth date in YYYY-MM-DD format').meta({ example: '1879-03-14' }),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().describe('Birth time in HH:MM format, or null if unknown').meta({ example: '11:30' }),
  lat: z.number().min(-90).max(90).describe('Latitude of birth location').meta({ example: 48.4011 }),
  lon: z.number().min(-180).max(180).describe('Longitude of birth location').meta({ example: 9.9876 }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes at time of birth').meta({ example: 60 }),
  houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN']).default('PLACIDUS').describe('House system'),
}).merge(EngineFilterSchema);
export type NatalRequest = z.infer<typeof NatalRequestSchema>;
