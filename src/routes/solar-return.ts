import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SolarReturnRequestSchema } from '../schemas/solar-return.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateSolarReturn } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function solarReturnRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/solar-return',
    schema: {
      summary: 'Calculate solar return chart',
      description: 'Returns the natal chart calculated for the exact moment when the transiting Sun returns to the natal Sun longitude in the target year.',
      tags: ['charts'],
      body: SolarReturnRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => calculateSolarReturn(req.body), chartCache.natalTtlMs);
    },
  });
}
