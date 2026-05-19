import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  LunarReturnRequestSchema,
  LunarReturnListRequestSchema,
  LunarReturnListResponseSchema,
} from '../schemas/lunar-return.js';
import { NatalChartDataSchema } from '../schemas/responses.js';
import { calculateLunarReturn, listLunarReturns } from '../engine/index.js';
import { chartCache } from '../engine/cache.js';

export async function lunarReturnRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/lunar-return',
    schema: {
      summary: 'Calculate lunar return chart',
      description: 'Returns the natal chart calculated for the exact moment when the transiting Moon returns to the natal Moon longitude after the target date.',
      tags: ['charts'],
      body: LunarReturnRequestSchema,
      response: { 200: NatalChartDataSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey(req.body as Record<string, unknown>);
      return chartCache.getOrSet(cacheKey, () => calculateLunarReturn(req.body), chartCache.natalTtlMs);
    },
  });
}

export async function lunarReturnListRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/v1/charts/lunar-return/list',
    schema: {
      summary: 'List lunar returns for a calendar year',
      description: 'Returns every lunar return moment (~13) whose local datetime falls within the given year at the return location.',
      tags: ['charts'],
      body: LunarReturnListRequestSchema,
      response: { 200: LunarReturnListResponseSchema },
    },
    handler: async (req) => {
      const cacheKey = chartCache.generateKey({ _kind: 'lr-list', ...(req.body as Record<string, unknown>) });
      return chartCache.getOrSet(cacheKey, () => listLunarReturns(req.body), chartCache.natalTtlMs);
    },
  });
}
