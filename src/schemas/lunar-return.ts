import { z } from 'zod';
import { EngineFilterSchema } from './natal.js';

export const LunarReturnRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Birth date in YYYY-MM-DD format').meta({ example: '1990-06-15' }),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().describe('Birth time in HH:MM format, or null if unknown').meta({ example: '14:30' }),
  lat: z.number().min(-90).max(90).describe('Latitude of birth location').meta({ example: 35.6762 }),
  lon: z.number().min(-180).max(180).describe('Longitude of birth location').meta({ example: 139.6503 }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes at time of birth').meta({ example: 540 }),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Find next lunar return after this date (ignored when returnJd is provided)').meta({ example: '2026-03-17' }),
  returnJd: z.number().optional().describe('Exact Julian Day of a specific return (from the list endpoint); when set, skips the targetDate solve'),
  returnLat: z.number().min(-90).max(90).describe('Latitude for the return chart location').meta({ example: 35.6762 }),
  returnLon: z.number().min(-180).max(180).describe('Longitude for the return chart location').meta({ example: 139.6503 }),
  returnUtcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset at the return location').meta({ example: 540 }),
  houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN', 'KOCH', 'REGIOMONTANUS', 'CAMPANUS', 'EQUAL', 'PORPHYRY']).default('PLACIDUS').describe('House system'),
  zodiacSystem: z.enum(['tropical', 'sidereal']).default('tropical').describe('Zodiac system (tropical or sidereal/Lahiri)'),
}).merge(EngineFilterSchema);

export type LunarReturnRequest = z.infer<typeof LunarReturnRequestSchema>;

export const LunarReturnListRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Birth date in YYYY-MM-DD format').meta({ example: '1990-06-15' }),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().describe('Birth time in HH:MM format, or null if unknown').meta({ example: '14:30' }),
  lat: z.number().min(-90).max(90).describe('Latitude of birth location').meta({ example: 35.6762 }),
  lon: z.number().min(-180).max(180).describe('Longitude of birth location').meta({ example: 139.6503 }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes at time of birth').meta({ example: 540 }),
  year: z.number().int().min(1800).max(2400).describe('Calendar year (return location local time) to list lunar returns for').meta({ example: 2026 }),
  returnLat: z.number().min(-90).max(90).describe('Latitude for the return chart location').meta({ example: 35.6762 }),
  returnLon: z.number().min(-180).max(180).describe('Longitude for the return chart location').meta({ example: 139.6503 }),
  returnUtcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset at the return location').meta({ example: 540 }),
});

export type LunarReturnListRequest = z.infer<typeof LunarReturnListRequestSchema>;

export const LunarReturnListResponseSchema = z.object({
  returns: z.array(z.object({
    julianDay: z.number().describe('Julian Day (UT) of the lunar return moment'),
    datetime: z.string().describe('Local wall-clock datetime at the return location (ISO-like)'),
  })),
});
