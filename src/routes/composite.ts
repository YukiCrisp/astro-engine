import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CompositeRequestSchema } from '../schemas/composite.js';
import { NatalChartWithPatternsSchema } from '../schemas/responses.js';
import { calculateComposite, attachAspectPatterns } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function compositeRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/composite',
    schema: {
      summary: 'Calculate composite chart',
      description: 'Returns a midpoint-based composite chart for two persons.',
      tags: ['charts'],
      body: CompositeRequestSchema,
      response: { 200: NatalChartWithPatternsSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey({ _type: 'composite', ...req.body as Record<string, unknown> });
      return chartCache.getOrSet(cacheKey, () => attachAspectPatterns(calculateComposite(req.body)), chartCache.natalTtlMs);
    },
  });
}
