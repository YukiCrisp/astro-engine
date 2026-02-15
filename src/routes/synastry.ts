import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SynastryRequestSchema } from '../schemas/synastry.js';
import { SynastryChartDataSchema } from '../schemas/responses.js';
import { calculateSynastry } from '../engine/index.js';

export async function synastryRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/synastry',
    schema: {
      summary: 'Calculate synastry chart',
      description: 'Returns natal charts for two persons and their cross-aspects.',
      tags: ['charts'],
      body: SynastryRequestSchema,
      response: { 200: SynastryChartDataSchema },
    },
    handler: async (req) => calculateSynastry(req.body),
  });
}
