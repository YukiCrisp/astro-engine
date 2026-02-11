import { buildApp } from '../src/app.js';

const app = await buildApp();
await app.ready();
const spec = app.swagger();
process.stdout.write(JSON.stringify(spec, null, 2));
process.exit(0);
