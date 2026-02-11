import type { FastifyInstance } from 'fastify';
import { isEphePathSet, epheFilesPresent } from '../engine/sweph-adapter.js';

export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    swephLoaded: isEphePathSet(),
    epheFilesPresent: epheFilesPresent(),
    uptime: process.uptime(),
  }));
}
