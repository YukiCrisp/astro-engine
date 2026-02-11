import { z } from 'zod';

export const NatalRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  utcOffsetMinutes: z.number().int().min(-840).max(840),
  houseSystem: z.enum(['PLACIDUS', 'WHOLE_SIGN']).default('PLACIDUS'),
});
export type NatalRequest = z.infer<typeof NatalRequestSchema>;
