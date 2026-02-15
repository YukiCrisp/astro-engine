import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CompositeRequestSchema } from '../schemas/composite.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateComposite } from '../engine/index.js';

export async function compositeRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/composite',
    schema: {
      summary: 'Calculate composite chart',
      description: 'Returns a midpoint-based composite chart for two persons.',
      tags: ['charts'],
      body: CompositeRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => calculateComposite(req.body),
  });
}
