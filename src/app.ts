import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { healthRoute } from './routes/health.js';
import { natalRoute } from './routes/natal.js';
import { progressedRoute } from './routes/progressed.js';
import { transitRoute } from './routes/transit.js';
import { tripleRoute } from './routes/triple.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors);

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'astro-engine',
        description: 'Swiss Ephemeris HTTP microservice for natal, progressed, and transit chart calculations.',
        version: '0.1.0',
        license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
      },
      tags: [
        { name: 'health', description: 'Service health and readiness' },
        { name: 'charts', description: 'Astrological chart calculations' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameters', details: err.issues },
      });
    }
    if ('validation' in err && (err as Record<string, unknown>).validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: err.message, details: (err as Record<string, unknown>).validation },
      });
    }
    if (err.message?.includes('sweph')) {
      return reply.status(422).send({
        error: { code: 'CALCULATION_ERROR', message: err.message },
      });
    }
    app.log.error(err);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  await app.register(healthRoute);
  await app.register(natalRoute);
  await app.register(progressedRoute);
  await app.register(transitRoute);
  await app.register(tripleRoute);

  return app;
}
