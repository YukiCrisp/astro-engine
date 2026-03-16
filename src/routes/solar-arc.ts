import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SolarArcRequestSchema } from '../schemas/solar-arc.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateSolarArc } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function solarArcRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/solar-arc',
    schema: {
      summary: 'Calculate solar arc directed chart',
      description: 'Returns planetary positions directed by the solar arc (the distance the progressed Sun has traveled from its natal position).',
      tags: ['charts'],
      body: SolarArcRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => calculateSolarArc(req.body), chartCache.natalTtlMs);
    },
  });
}
