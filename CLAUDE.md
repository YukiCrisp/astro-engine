# astro-engine

## Stack
- **Framework:** Fastify 5 with fastify-type-provider-zod
- **Swiss Ephemeris:** sweph (use `"sweph": "latest"` -- only pre-release versions exist)
- **Tests:** Vitest (`bun run test`)
- **Dev server:** `bun run dev` (tsx watch)

## Verification
- `bun run build` -- compile TypeScript
- `bun run test` -- run Vitest suite

## Conventions
- ESM throughout (`"type": "module"`, `.js` extensions in imports)
- Zod schemas define both validation and OpenAPI docs (via fastify-type-provider-zod)
- Request schemas in `src/schemas/`, response schemas in `src/schemas/responses.ts`
- Route handlers are thin -- business logic lives in `src/engine/`
- sweph adapter (`src/engine/sweph-adapter.ts`) is the only file that imports from `sweph` directly
