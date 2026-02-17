import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { EphemerisRequestSchema } from '../schemas/ephemeris.js';
import { VocMoonDataSchema } from '../schemas/responses.js';
import { calculateVocMoon } from '../engine/index.js';

export async function vocMoonRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/ephemeris/voc-moon',
    schema: {
      summary: 'Calculate void-of-course Moon periods',
      description: 'Returns all void-of-course Moon periods for a given month.',
      tags: ['charts'],
      body: EphemerisRequestSchema,
      response: { 200: VocMoonDataSchema },
    },
    handler: async (req) => calculateVocMoon(req.body),
  });
}
