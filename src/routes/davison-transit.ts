import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DavisonTransitRequestSchema } from '../schemas/davison-transit.js';
import { DavisonTransitChartDataSchema } from '../schemas/responses.js';
import { calculateDavisonTransit } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function davisonTransitRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/davison-transit',
    schema: {
      summary: 'Calculate transits over the Davison chart',
      description: 'Returns the Davison chart of two persons, the transiting sky of the requested moment, and the aspects from Davison bodies to transiting bodies.',
      tags: ['charts'],
      body: DavisonTransitRequestSchema,
      response: { 200: DavisonTransitChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey({ _type: 'davison-transit', ...req.body as Record<string, unknown> });
      return chartCache.getOrSet(cacheKey, () => calculateDavisonTransit(req.body), chartCache.transitTtlMs);
    },
  });
}
