import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TransitRequestSchema } from '../schemas/transit.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateTransit } from '../engine/index.js';

export async function transitRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/transit',
    schema: {
      summary: 'Calculate transit chart',
      description: 'Returns planetary positions and house cusps for a given date/time/location.',
      tags: ['charts'],
      body: TransitRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => calculateTransit(req.body),
  });
}
