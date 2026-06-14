import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TransitRequestSchema } from '../schemas/transit.js';
import { NatalChartWithPatternsSchema } from '../schemas/responses.js';
import { calculateTransit, attachAspectPatterns } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function transitRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/transit',
    schema: {
      summary: 'Calculate transit chart',
      description: 'Returns planetary positions and house cusps for a given date/time/location.',
      tags: ['charts'],
      body: TransitRequestSchema,
      response: { 200: NatalChartWithPatternsSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => attachAspectPatterns(calculateTransit(req.body)), chartCache.transitTtlMs);
    },
  });
}
