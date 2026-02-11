import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TripleRequestSchema } from '../schemas/triple.js';
import { TripleChartDataSchema } from '../schemas/responses.js';
import { calculateTriple } from '../engine/index.js';

export async function tripleRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/triple',
    schema: {
      summary: 'Calculate triple chart (natal + progressed + transit)',
      description: 'Returns natal, secondary progressed, and transit charts in a single call, with optional cross-chart aspects.',
      tags: ['charts'],
      body: TripleRequestSchema,
      response: { 200: TripleChartDataSchema },
    },
    handler: async (req) => {
      const { natal, progressed, transit, computeCrossAspects } = req.body;
      return calculateTriple({
        natal,
        progressedDate: progressed.progressedDate,
        transit,
        computeCrossAspects,
      });
    },
  });
}
