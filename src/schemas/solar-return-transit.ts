import { z } from 'zod';
import { EngineFilterSchema } from './natal.js';
import { SolarReturnRequestSchema } from './solar-return.js';
import { TransitRequestSchema } from './transit.js';

export const SolarReturnTransitRequestSchema = z.object({
  solarReturn: SolarReturnRequestSchema,
  transit: TransitRequestSchema,
}).merge(EngineFilterSchema);
export type SolarReturnTransitRequest = z.infer<typeof SolarReturnTransitRequestSchema>;
