import { z } from 'zod';

export const TransitRequestSchema = z.object({
  transitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transit date in YYYY-MM-DD format').meta({ example: '2025-06-15' }),
  transitTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().describe('Transit time in HH:MM format, or null if unknown').meta({ example: '12:00' }),
  lat: z.number().min(-90).max(90).describe('Latitude of location').meta({ example: 48.4011 }),
  lon: z.number().min(-180).max(180).describe('Longitude of location').meta({ example: 9.9876 }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes').meta({ example: 120 }),
  houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN']).default('PLACIDUS').describe('House system'),
});
export type TransitRequest = z.infer<typeof TransitRequestSchema>;
