# AGENTS.md

Operating guide for AI agents working in this repository.

## Overview

Project ERP is a pnpm workspace monorepo:

- `apps/web` — `@project-erp/web`, React + Vite SPA (dev server on `:5173`, proxies `/api` → `:3001`).
- `apps/api` — `@project-erp/api`, Hono server (on `:3001`), Drizzle ORM over PostgreSQL.
- `packages/db` — `@project-erp/db`, Drizzle schema + migrations + client.
- `packages/validators` — `@project-erp/validators`, shared Zod schemas.

Toolchain: Node `>=20` (CI/dev uses 22), `pnpm@9.15.0` (see `packageManager`). Always use `pnpm`, never `npm`/`yarn`.

## Database

- The app expects PostgreSQL at `postgres://projecterp:projecterp@127.0.0.1:15432/projecterp` (note the non-standard port `15432`). This is the default baked into `packages/db` and `apps/api`, so no `.env` is needed for local dev when the DB matches it.
- Locally the repo documents Postgres via `docker compose up -d postgres` (`docker-compose.yml`). In the Cloud Agent environment there is no Docker daemon; Postgres is installed/started natively — see the "Cloud Agent environment" section.
- Apply schema migrations with `pnpm db:migrate` (requires `DATABASE_URL` set, or the default above). Migrations live in `packages/db/drizzle`.

## Common commands

Run from the repo root:

- Install deps: `pnpm install --frozen-lockfile`
- Build everything: `pnpm run build` (order matters: `validators → db → api → web`).
- Run both apps in dev: `pnpm dev` (concurrently runs the API and web dev servers).
- Migrate DB: `pnpm db:migrate`
- Smoke test (API end-to-end): `pnpm test:smoke` (runs `scripts/e2e-smoke.sh` against a running API on `:3001`).
- Browser e2e: `pnpm test:e2e` (Playwright; its config starts/reuses the web server on `:5173` and expects the API on `:3001`). Requires a browser: `pnpm exec playwright install chromium`.
- Full check: `pnpm test:full` (`build` + `test:smoke` + `test:e2e`).

Useful env vars for local/dev:

- `DATABASE_URL` — Postgres connection string (defaults as above).
- `SAP_ECHO_MODE=true` — returns stub SAP PO lines so purchasing/SAP flows work without a real SAP source (recommended in dev).
- `GEMINI_API_KEY` — enables the AI "work complete" features (`apps/api/src/lib/gemini.ts`); optional.
- Other optional integrations (Resend email digests, Web Push VAPID keys) are read from env and no-op when unset.

## Gotchas (non-obvious)

- `@project-erp/db` and `@project-erp/validators` are consumed by the API via their built `dist/` output (their `package.json` `main`/`exports` point at `dist`). You must run `pnpm run build` (or at least build those two packages) before the API dev server or migrations resolve them — a fresh `pnpm install` alone is not enough.
- The web dev server proxies `/api` to `127.0.0.1:3001` (see `apps/web/vite.config.ts`); Playwright deliberately runs Vite with `VITE_API_URL` unset so cookies match the page origin. Keep API and web on the loopback IP `127.0.0.1` (not `localhost`) to avoid cookie/host mismatches.
- The smoke test and Playwright specs skip or fail fast unless the API `/api/health` endpoint is reachable on `:3001` first.

## Cloud Agent environment

The Cloud Agent environment is defined under `.cursor/`:

- `.cursor/install.sh` — idempotent bootstrap (self-provisions PostgreSQL 16 via apt if missing, `pnpm install`, `pnpm run build`, installs Playwright chromium, warms the DB).
- `.cursor/db-up.sh` — idempotent per-boot DB bring-up (starts the cluster on `:15432`, ensures the `projecterp` role/database, applies migrations). Run this if `pg_isready -h 127.0.0.1 -p 15432` fails.
- `.cursor/environment.json` — wires the above into `install`/`start` and runs `pnpm dev` in a terminal.

Do not commit secrets. Configure integration keys (e.g. `GEMINI_API_KEY`) via environment secrets, not files.
