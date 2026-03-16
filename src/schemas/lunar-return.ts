import { z } from 'zod';
import { EngineFilterSchema } from './natal.js';

export const LunarReturnRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Birth date in YYYY-MM-DD format').meta({ example: '1990-06-15' }),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().describe('Birth time in HH:MM format, or null if unknown').meta({ example: '14:30' }),
  lat: z.number().min(-90).max(90).describe('Latitude of birth location').meta({ example: 35.6762 }),
  lon: z.number().min(-180).max(180).describe('Longitude of birth location').meta({ example: 139.6503 }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes at time of birth').meta({ example: 540 }),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Find next lunar return after this date').meta({ example: '2026-03-17' }),
  returnLat: z.number().min(-90).max(90).describe('Latitude for the return chart location').meta({ example: 35.6762 }),
  returnLon: z.number().min(-180).max(180).describe('Longitude for the return chart location').meta({ example: 139.6503 }),
  returnUtcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset at the return location').meta({ example: 540 }),
  houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN', 'KOCH', 'REGIOMONTANUS', 'CAMPANUS', 'EQUAL', 'PORPHYRY']).default('PLACIDUS').describe('House system'),
  zodiacSystem: z.enum(['tropical', 'sidereal']).default('tropical').describe('Zodiac system (tropical or sidereal/Lahiri)'),
}).merge(EngineFilterSchema);

export type LunarReturnRequest = z.infer<typeof LunarReturnRequestSchema>;
