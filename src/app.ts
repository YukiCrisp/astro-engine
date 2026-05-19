import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform, isResponseSerializationError } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { chartCache } from './engine/cache.js';
import { healthRoute } from './routes/health.js';
import { natalRoute } from './routes/natal.js';
import { progressedRoute } from './routes/progressed.js';
import { transitRoute } from './routes/transit.js';
import { tripleRoute } from './routes/triple.js';
import { synastryRoute } from './routes/synastry.js';
import { compositeRoute } from './routes/composite.js';
import { ephemerisRoute } from './routes/ephemeris.js';
import { vocMoonRoute } from './routes/voc-moon.js';
import { natalAnalysisRoute } from './routes/natal-analysis.js';
import { solarReturnRoute } from './routes/solar-return.js';
import { solarArcRoute } from './routes/solar-arc.js';
import { lunarReturnRoute, lunarReturnListRoute } from './routes/lunar-return.js';

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
    if (isResponseSerializationError(err)) {
      app.log.error({ cause: (err as { cause?: unknown }).cause }, 'Response serialization failed');
    } else {
      app.log.error(err);
    }
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  await app.register(healthRoute);
  await app.register(natalRoute);
  await app.register(natalAnalysisRoute);
  await app.register(progressedRoute);
  await app.register(transitRoute);
  await app.register(tripleRoute);
  await app.register(synastryRoute);
  await app.register(compositeRoute);
  await app.register(ephemerisRoute);
  await app.register(vocMoonRoute);
  await app.register(solarReturnRoute);
  await app.register(solarArcRoute);
  await app.register(lunarReturnRoute);
  await app.register(lunarReturnListRoute);

  app.get('/v1/cache/stats', async () => chartCache.stats());
  app.post('/v1/cache/clear', async () => {
    chartCache.clear();
    return { cleared: true };
  });

  return app;
}
