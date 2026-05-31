# astro-engine

## Stack
- **Framework:** Fastify 5 with fastify-type-provider-zod
- **Swiss Ephemeris:** sweph (use `"sweph": "latest"` -- only pre-release versions exist)
- **Tests:** Vitest (`bun run test`)
- **Dev server:** `bun run dev` (tsx watch, port 3001)

## Verification
- `bun run build` -- compile TypeScript
- `bun run test` -- run Vitest suite

## Conventions
- ESM throughout (`"type": "module"`, `.js` extensions in imports)
- Zod schemas define both validation and OpenAPI docs (via fastify-type-provider-zod)
- Request schemas in `src/schemas/`, response schemas in `src/schemas/responses.ts`
- Route handlers are thin -- business logic lives in `src/engine/`
- sweph adapter (`src/engine/sweph-adapter.ts`) is the only file that imports from `sweph` directly

## Endpoints

All endpoints are versioned under `/v1/`:

| Method | Route | Description |
|--------|-------|-------------|
| POST | /v1/charts/natal | Calculate natal chart |
| POST | /v1/charts/natal/analysis | Natal chart with pattern analysis |
| POST | /v1/charts/progressed | Secondary progressions |
| POST | /v1/charts/transit | Transit chart |
| POST | /v1/charts/triple | Triple chart (natal + progressed + transit) |
| POST | /v1/charts/synastry | Synastry (two natal charts + cross-aspects) |
| POST | /v1/charts/composite | Composite chart (midpoint method) |
| POST | /v1/charts/solar-return | Solar return chart for a target year |
| POST | /v1/charts/lunar-return | Lunar return chart after a target date |
| POST | /v1/charts/astromap | Astrocartography MC/IC/AC/DC lines for a birth moment |
| POST | /v1/ephemeris/monthly | Monthly planet positions + events |
| POST | /v1/ephemeris/voc-moon | Void-of-course Moon periods |
| GET | /v1/cache/stats | Cache hit/miss/size statistics |
| POST | /v1/cache/clear | Clear the calculation cache |
| GET | /v1/health | Health check |

## Calculation Modules (`src/engine/calculations/`)

| Module | Purpose |
|--------|---------|
| `aspects.ts` | Aspect detection (within-chart and cross-chart) with configurable orbs |
| `houses.ts` | House cusp calculations for 7 house systems |
| `progressions.ts` | Secondary progressions (1 day = 1 year) |
| `composite.ts` | Shorter-arc midpoint longitude calculation |
| `solar-return.ts` | Find exact Julian Day of Sun return to natal longitude |
| `lunar-return.ts` | Find exact Julian Day of Moon return to natal longitude |
| `arabic-parts.ts` | Arabic Parts: Fortune, Spirit, Eros, Marriage (day/night aware) |
| `fixed-stars.ts` | Major fixed star positions at a given Julian Day |
| `chart-analysis.ts` | Chart pattern analysis (culminating/rising planet, distribution) |
| `voc-moon.ts` | Void-of-course Moon period detection |
| `astrocartography.ts` | Astrocartography line computation (MC/IC closed-form, AC/DC via shared-`calcHouses` bisection) |

## Cache System (`src/engine/cache.ts`)

LRU calculation cache to avoid redundant Swiss Ephemeris calls:
- **Max entries:** 1000 (configurable)
- **TTL:** 24h for natal/return charts, 1h for transit charts
- **Cache key:** SHA-256 hash of sorted request parameters
- **API:** `chartCache.getOrSet(key, compute, ttl)` -- all route handlers use this
- **Management:** `GET /v1/cache/stats`, `POST /v1/cache/clear`

## Supported Features

- **House systems:** Placidus, Whole Sign, Koch, Regiomontanus, Campanus, Equal, Porphyry
- **Zodiac systems:** Tropical (default), Sidereal
- **Arabic Parts:** Part of Fortune, Part of Spirit, Part of Eros, Part of Marriage
- **Fixed Stars:** Major fixed star positions
- **Declination:** Included in every PlanetPosition; enables OOB detection
- **Astrocartography:** MC/IC/AC/DC planetary lines for the 10 classical planets (Sun→Pluto)
- **Filter params:** All chart endpoints accept optional `enabledPlanets`, `enabledAspects`, `aspectOrbs`, `sunOrbBonus`, `moonOrbBonus`, `enabledArabicParts`, `includeFixedStars`

## Versioning

Engine responses include `meta.schemaVersion` (currently `1`). Bump it only on a **breaking** response-shape change (field removed, type narrowed, semantic shift). Additive fields do **not** bump the version — the frontend tolerates unknown keys. Bumping the version makes stale frontends fail loudly via `AstroEngineSchemaMismatchError` on the next request, which is the intended behavior.
