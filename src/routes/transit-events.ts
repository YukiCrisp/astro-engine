import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TransitEventsRequestSchema } from '../schemas/transit-events.js';
import { TransitEventsDataSchema } from '../schemas/responses.js';
import { calculateTransitEvents } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function transitEventsRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/transit-events',
    schema: {
      summary: 'Calculate transit event calendar',
      description: 'Returns a calendar of transit events against a natal chart over a date window of up to 366 days: exact natal aspects, stations, and sign/house ingresses.',
      tags: ['charts'],
      body: TransitEventsRequestSchema,
      response: { 200: TransitEventsDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey({ _route: 'charts/transit-events', ...req.body as Record<string, unknown> });
      return chartCache.getOrSet(cacheKey, () => calculateTransitEvents(req.body), chartCache.transitEventsTtlMs);
    },
  });
}
