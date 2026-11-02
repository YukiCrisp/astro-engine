import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DavisonRequestSchema } from '../schemas/davison.js';
import { DavisonChartSchema } from '../schemas/responses.js';
import { calculateDavison, attachAspectPatterns } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function davisonRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/davison',
    schema: {
      summary: 'Calculate Davison relationship chart',
      description: 'Returns the chart cast for the moment halfway between two births (UT) at the midpoint of the two birthplaces. Latitude is averaged; longitude is averaged the shorter way round the globe.',
      tags: ['charts'],
      body: DavisonRequestSchema,
      response: { 200: DavisonChartSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey({ _type: 'davison', ...req.body as Record<string, unknown> });
      return chartCache.getOrSet(cacheKey, () => attachAspectPatterns(calculateDavison(req.body)), chartCache.natalTtlMs);
    },
  });
}
