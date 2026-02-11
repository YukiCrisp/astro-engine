import { buildApp } from './app.js';
import { initSweph } from './engine/sweph-adapter.js';

const PORT = Number(process.env.PORT ?? 3001);
const EPHE_PATH = process.env.SWE_EPHE_PATH ?? './ephe';

initSweph(EPHE_PATH);

const app = await buildApp();
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`astro-engine listening on port ${PORT}`);
