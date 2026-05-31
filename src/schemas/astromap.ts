import { z } from 'zod';
import { EngineFilterSchema } from './natal.js';

export const AstromapRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Birth date in YYYY-MM-DD format').meta({ example: '1879-03-14' }),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).describe('Birth time in HH:MM format. Required — astrocartography depends on exact rotation.').meta({ example: '11:30' }),
  utcOffsetMinutes: z.number().int().min(-840).max(840).describe('UTC offset in minutes at time of birth').meta({ example: 40 }),
}).merge(EngineFilterSchema.pick({ enabledPlanets: true }));

export type AstromapRequest = z.infer<typeof AstromapRequestSchema>;
