import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AstromapRequestSchema } from '../schemas/astromap.js';
import { AstromapDataSchema } from '../schemas/responses.js';
import { calculateAstromap } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function astromapRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/astromap',
    schema: {
      summary: 'Calculate astrocartography lines',
      description: 'Returns MC/IC/AC/DC planetary lines for the given birth moment, suitable for plotting on a world map.',
      tags: ['charts'],
      body: AstromapRequestSchema,
      response: { 200: AstromapDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => calculateAstromap(req.body), chartCache.natalTtlMs);
    },
  });
}
