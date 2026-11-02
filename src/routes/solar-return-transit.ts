import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SolarReturnTransitRequestSchema } from '../schemas/solar-return-transit.js';
import { SolarReturnTransitChartDataSchema } from '../schemas/responses.js';
import { calculateSolarReturnTransit } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function solarReturnTransitRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/solar-return-transit',
    schema: {
      summary: 'Calculate transits over a solar return chart',
      description: 'Returns the solar return chart of the requested year, the transiting sky of the requested moment, and the aspects from return bodies to transiting bodies.',
      tags: ['charts'],
      body: SolarReturnTransitRequestSchema,
      response: { 200: SolarReturnTransitChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey({ _type: 'solar-return-transit', ...req.body as Record<string, unknown> });
      return chartCache.getOrSet(cacheKey, () => calculateSolarReturnTransit(req.body), chartCache.transitTtlMs);
    },
  });
}
