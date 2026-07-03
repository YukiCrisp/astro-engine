import { z } from 'zod';
import { PlanetIdEnum } from './responses.js';

const MS_PER_DAY = 86_400_000;

/** Inclusive day count between two YYYY-MM-DD dates. */
function inclusiveDayCount(startDate: string, endDate: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / MS_PER_DAY) + 1;
}

export const TransitEventsRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Birth date in YYYY-MM-DD format').meta({ example: '1990-04-15' }),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().describe('Birth time in HH:MM format, or null if unknown').meta({ example: '14:30' }),
  lat: z.number().min(-90).max(90).describe('Latitude of birth location').meta({ example: 35.6762 }),
  lon: z.number().min(-180).max(180).describe('Longitude of birth location').meta({ example: 139.6503 }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes at time of birth').meta({ example: 540 }),
  houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN', 'KOCH', 'REGIOMONTANUS', 'CAMPANUS', 'EQUAL', 'PORPHYRY']).default('PLACIDUS').describe('House system'),
  zodiacSystem: z.enum(['tropical', 'sidereal']).default('tropical').describe('Zodiac system (tropical or sidereal/Lahiri)'),
  enabledPlanets: z.array(PlanetIdEnum).optional().describe('Only compute these planets (natal targets; CHIRON participation follows this list)'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Window start date in YYYY-MM-DD format').meta({ example: '2026-01-01' }),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Window end date in YYYY-MM-DD format (inclusive)').meta({ example: '2026-12-31' }),
}).refine(
  (v) => v.endDate > v.startDate && inclusiveDayCount(v.startDate, v.endDate) <= 366,
  { message: 'Window must be 1-366 days' },
);
export type TransitEventsRequest = z.infer<typeof TransitEventsRequestSchema>;
