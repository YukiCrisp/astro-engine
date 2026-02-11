import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NatalRequestSchema } from '../schemas/natal.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateNatal } from '../engine/index.js';

export async function natalRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/natal',
    schema: {
      summary: 'Calculate natal chart',
      description: 'Returns planetary positions, house cusps, angles, and aspects for a birth date/time/location.',
      tags: ['charts'],
      body: NatalRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => calculateNatal(req.body),
  });
}
