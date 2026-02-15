import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { EphemerisRequestSchema } from '../schemas/ephemeris.js';
import { EphemerisDataSchema } from '../schemas/responses.js';
import { calculateEphemeris } from '../engine/index.js';

export async function ephemerisRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/ephemeris/monthly',
    schema: {
      summary: 'Calculate monthly ephemeris',
      description: 'Returns daily planetary positions and events (ingresses, stations, exact aspects) for a given month.',
      tags: ['charts'],
      body: EphemerisRequestSchema,
      response: { 200: EphemerisDataSchema },
    },
    handler: async (req) => calculateEphemeris(req.body),
  });
}
