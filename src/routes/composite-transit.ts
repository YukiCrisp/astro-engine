import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CompositeTransitRequestSchema } from '../schemas/composite-transit.js';
import { CompositeTransitChartDataSchema } from '../schemas/responses.js';
import { calculateCompositeTransit } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function compositeTransitRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/composite-transit',
    schema: {
      summary: 'Calculate transits to a composite chart',
      description: 'Returns the midpoint composite chart of two persons, the transiting positions for a moment, and their cross-aspects.',
      tags: ['charts'],
      body: CompositeTransitRequestSchema,
      response: { 200: CompositeTransitChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey({ _type: 'composite-transit', ...req.body as Record<string, unknown> });
      return chartCache.getOrSet(cacheKey, () => calculateCompositeTransit(req.body), chartCache.transitTtlMs);
    },
  });
}
