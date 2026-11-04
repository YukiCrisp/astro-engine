import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ForecastRequestSchema } from '../schemas/forecast.js';
import { ForecastDataSchema } from '../schemas/responses.js';
import { calculateForecast } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';
import type { ForecastAspectType, ForecastTarget, PlanetId } from '../engine/types.js';

export async function forecastRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/forecast',
    schema: {
      summary: 'Calculate the forecast list',
      description: 'Returns every transit or secondary-progressed aspect to the natal chart that is inside the orb during a window of up to ten years: when it enters and leaves the orb, and each exact moment (a retrograde loop that perfects up to three times is one row).',
      tags: ['charts'],
      body: ForecastRequestSchema,
      response: { 200: ForecastDataSchema },
    },
    handler: async (req) => {
      const body = req.body;
      const cacheKey = chartCache.generateKey({ _route: 'charts/forecast', ...body as Record<string, unknown> });
      return chartCache.getOrSet(cacheKey, () => calculateForecast({
        ...body,
        movers: body.movers as PlanetId[],
        targets: body.targets as ForecastTarget[],
        aspects: body.aspects as ForecastAspectType[],
      }));
    },
  });
}
