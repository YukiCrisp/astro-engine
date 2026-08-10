# astro-engine

Open-source astrological calculation microservice built on [Swiss Ephemeris](https://www.astro.com/swisseph/).
Licensed under AGPL-3.0.

## Quick Start

### Prerequisites
- Node.js 22+
- [Bun](https://bun.sh) (package manager)
- Swiss Ephemeris data files (see below)

### Setup
```bash
bun install
sh scripts/download-ephe.sh
cp .env.example .env
bun run dev
```

API running at http://localhost:3001
Interactive docs at http://localhost:3001/docs

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `SWE_EPHE_PATH` | `./ephe` | Path to .se1 ephemeris files |
| `NODE_ENV` | `development` | `development` \| `production` |

## Docker
```bash
docker build -t astro-engine .
docker run -p 3001:3001 astro-engine
```
Ephemeris files are baked into the image at build time.

## API Reference

See **interactive docs** at `/docs` (Swagger UI) when running.

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/v1/charts/natal` | Natal chart (planets, houses, aspects) |
| POST | `/v1/charts/progressed` | Secondary progressed chart |
| POST | `/v1/charts/transit` | Transit chart |
| POST | `/v1/charts/triple` | Natal + progressed + transit in one call |

### POST /v1/charts/natal
```bash
curl -X POST http://localhost:3001/v1/charts/natal \
  -H 'Content-Type: application/json' \
  -d '{
    "birthDate": "1990-04-15",
    "birthTime": "14:30",
    "lat": 35.6895,
    "lon": 139.6917,
    "utcOffsetMinutes": 540,
    "houseSystem": "PLACIDUS"
  }'
```

When `birthTime` is `null` the whole chart is calculated at local noon — planets, and since ENGA-2976 houses and angles too — and `meta.birthTimeAssumed` is `true`.

That flag is part of the contract, not a hint. An assumed-noon ASC advances a full sign roughly every two hours, so it lands on the true sign about one time in twelve; `arabicParts` and every house placement inherit the same error. Clients must branch on `meta.birthTimeAssumed`, not on `angles !== null` — the engine now fills `angles` in from the assumption, so the null check no longer separates measured from assumed. `/v1/charts/transit-events` mirrors the flag onto its own `meta`, because its HOUSE_INGRESS events and Sun house/hemisphere context are read off the natal houses.

Transit charts are the one exception: `transitTime: null` still returns `houses`/`angles` as `null`, since a transit moment is chosen by the caller rather than recovered from birth data.

### POST /v1/charts/triple
```bash
curl -X POST http://localhost:3001/v1/charts/triple \
  -H 'Content-Type: application/json' \
  -d '{
    "natal": { "birthDate": "1990-04-15", "birthTime": "14:30", "lat": 35.6895, "lon": 139.6917, "utcOffsetMinutes": 540, "houseSystem": "PLACIDUS" },
    "progressed": { "progressedDate": "2026-02-11" },
    "transit": { "transitDate": "2026-02-11", "transitTime": "12:00", "lat": 35.6895, "lon": 139.6917, "utcOffsetMinutes": 540 },
    "computeCrossAspects": true
  }'
```

## Testing
```bash
bun run test          # all tests
bun run test:unit     # unit tests only (no ephe files needed)
bun run test:accuracy # accuracy tests (requires ephe files)
```

## Accuracy
Planet positions are accurate to within 1 arcsecond for dates 1800-2400 CE using Swiss Ephemeris data files (based on JPL DE431).

## Security Note
This service has no authentication. **Never expose it publicly.** Run behind a private network — accessed only by `astrology-app`.

## License
AGPL-3.0-only. If you run a modified version as a network service, you must publish your source code.
