# astro-engine AI context

`astro-engine` is the AGPL-3.0-only Fastify service that calculates HOSHIDOU astrology charts. This file is the repository's stable, tool-neutral starting point. It works without any personal knowledge base.

## Start here

1. Read this file and the task at hand.
2. Read the closest code, tests, and API schemas before making a change.
3. Keep changes on a branch. Run the checks that cover the change.
4. Ask for explicit approval before a merge or deployment.

## Commands

- Runtime: Node 22 or newer; package manager: Bun.
- Install dependencies: `bun install`
- Download local ephemeris data when needed: `sh scripts/download-ephe.sh`
- Develop on port 3001: `bun run dev`
- Build: `bun run build`
- Run all tests: `bun run test`
- Run unit tests: `bun run test:unit`
- Run accuracy tests (requires ephemeris data): `bun run test:accuracy`
- Export OpenAPI: `bun run docs:export`

Copy `.env.example` to `.env` only for local configuration. Never commit `.env`, credentials, tokens, or private birth data.

## Architecture and boundaries

- `src/server.ts` starts the HTTP service; `src/app.ts` registers Fastify routes and OpenAPI support.
- `src/routes/` keeps versioned `/v1/` request handlers thin.
- `src/schemas/` is the API contract: Zod request and response schemas provide validation and documentation.
- `src/engine/` contains calculations, types, caching, and the Swiss Ephemeris adapter. Pure calculation modules live in `src/engine/calculations/`.
- `src/engine/sweph-adapter.ts` is the only module allowed to import `sweph` directly.
- `test/unit/` covers deterministic calculation behavior. `test/accuracy/` compares results using ephemeris data.

`sweph` is AGPL software and stays in this repository. Proprietary applications and websites must call this service over HTTP; they must not import, copy, bundle, or link `sweph` or this engine's calculation code.

The service has no application authentication. Keep it on a private network and expose it only to authorized callers. Treat requests and responses as sensitive because they can contain birth information.

## Source of truth and write-back

- The current Git branch, tracked source, tests, `package.json`, `bun.lock`, and deployment configuration are the technical source of truth.
- Zod schemas and their route handlers define the supported HTTP contract. Update code, schema, tests, and generated OpenAPI output together when the API changes.
- `README.md` documents supported local use. This file records stable operating context; neither document is a task tracker or product-status log.
- Product strategy and personal working notes are external optional context. Do not copy private or changing status into this repository. When that context is unavailable, proceed from repository evidence or ask for direction.
- Write durable technical changes to the repository and commit them on the working branch. Record non-code decisions only in their approved knowledge-base location when one is available. Do not merge, deploy, publish, rotate credentials, or change secrets without explicit approval.

## Optional local enrichment

If `SECOND_BRAIN_PATH` is set, the Claude and Codex hooks may print the local HOSHIDOU hub. It is optional, read-only enrichment. A missing, unset, or unreadable path must not prevent normal repository work.

## Branch and merge rule (2026-09-03)

Collect development on the `dev` branch (create it from `main` if it does not exist). Ship by opening a pull request `dev` → `main`; **Yuki reviews and merges it**. Agents may merge verified feature-branch PRs into `dev` (checks green) without asking, but never merge into `main` — an instruction such as "no need to confirm" or "finish everything" covers work up to `dev` only. Do not merge release PRs opened by other sessions either. Merging into `main` is production release. Same rule as goyoka.
