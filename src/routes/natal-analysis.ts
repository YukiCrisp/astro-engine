import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NatalAnalysisRequestSchema, NatalAnalysisResponseSchema } from '../schemas/natal-analysis.js';
import { calculateNatalAnalysis } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function natalAnalysisRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/natal/analysis',
    schema: {
      summary: 'Calculate natal chart with analysis',
      description: 'Returns planetary positions, house cusps, angles, aspects, and chart analysis (pattern, culminating/rising planet, distribution).',
      tags: ['charts'],
      body: NatalAnalysisRequestSchema,
      response: { 200: NatalAnalysisResponseSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => calculateNatalAnalysis(req.body), chartCache.natalTtlMs);
    },
  });
}
