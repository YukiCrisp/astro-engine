import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LunarReturnRequestSchema } from '../schemas/lunar-return.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateLunarReturn } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function lunarReturnRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/lunar-return',
    schema: {
      summary: 'Calculate lunar return chart',
      description: 'Returns the natal chart calculated for the exact moment when the transiting Moon returns to the natal Moon longitude after the target date.',
      tags: ['charts'],
      body: LunarReturnRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => calculateLunarReturn(req.body), chartCache.natalTtlMs);
    },
  });
}
