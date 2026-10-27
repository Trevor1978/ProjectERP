# ProjectERP

Monorepo: Hono API (`apps/api`), React web (`apps/web`), shared DB (`packages/db`).

## Development

```bash
pnpm install
pnpm dev
```

See `.env.example` for `DATABASE_URL` and related settings.

## Production deploy

```bash
bash scripts/deploy-production.sh [branch]
```

Runs migrate, build, API restart, and web `dist` publish. See script header for `PROJECTERP_WEB_ROOT` and `PROJECTERP_API_UNIT`.

## Service API tokens (automation)

For non-interactive access to projects / milestones / tasks / todos, see **[docs/SERVICE_API_TOKENS.md](docs/SERVICE_API_TOKENS.md)**.

Quick example:

```bash
curl -sS 'https://projecterp-test.pureautomation.com.au/api/projects' \
  -H 'Authorization: Bearer pe_at_YOUR_TOKEN_HERE'
```

Create tokens as an org admin via **Organization → API tokens**, the org admin API under `/api/org/service-tokens`, or the CLI script documented in `docs/SERVICE_API_TOKENS.md`.
