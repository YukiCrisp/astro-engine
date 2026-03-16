import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ProgressedRequestSchema } from '../schemas/progressed.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateProgressed } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function progressedRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/progressed',
    schema: {
      summary: 'Calculate secondary progressed chart',
      description: 'Returns progressed planetary positions using secondary progression (1 day = 1 year).',
      tags: ['charts'],
      body: ProgressedRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => calculateProgressed(req.body), chartCache.natalTtlMs);
    },
  });
}
