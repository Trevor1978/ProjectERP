# Service API tokens (automation)

Scoped bearer tokens let automation (e.g. an assistant acting on an org admin’s behalf) call the **work** API without a browser session or user password.

## Scopes

| Scope | Allows |
|--------|--------|
| `work:read` | `GET` on projects, milestones, tasks, todos, project members, schedules, delete-previews |
| `work:write` | `work:read` plus `POST` / `PATCH` / `DELETE` on those resources, task dependencies, and project membership |

Tokens **cannot** access auth, org user management, procurement, time, notes, audit history, or other admin routes.

## Authentication

Send the token on every request:

```http
Authorization: Bearer pe_at_<secret>
```

- Tokens are prefixed with `pe_at_`.
- Invalid, revoked, or expired tokens receive `401`.
- Bursts above **300 requests per minute per token** receive `429` (per API process).
- Token auth does **not** set `pe_session` cookies.

## Create a token (test or production)

### Option A — Organization UI

1. Sign in as an **org admin**.
2. Open **Organization** → **API tokens**.
3. Create a token, copy the secret immediately (shown once).

### Option B — HTTP API (session cookie)

```bash
curl -sS -X POST 'https://projecterp-test.pureautomation.com.au/api/org/service-tokens' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: pe_session=YOUR_SESSION_ID' \
  -d '{"name":"Automation bot","scopes":["work:read","work:write"],"expiresInDays":90}'
```

### Option C — CLI on the server

After deploy and `pnpm db:migrate`, on the host with `DATABASE_URL` in `.env`:

```bash
pnpm --filter @project-erp/api exec tsx src/scripts/createServiceToken.ts \
  --org-email trevor@example.com \
  --name "Automation bot" \
  --scopes work:read,work:write \
  --expires-days 90
```

## Example API call

```bash
curl -sS 'https://projecterp-test.pureautomation.com.au/api/projects' \
  -H 'Authorization: Bearer pe_at_REPLACE_WITH_YOUR_TOKEN'
```

## Rotation and revocation

- **Revoke:** `POST /api/org/service-tokens/:id/revoke` (org admin, session auth).
- **Rotate:** `POST /api/org/service-tokens/:id/rotate` — returns a new secret once; old hash is replaced.

## Audit

- **Data changes** appear in the normal audit log with actor = the service user (e.g. `Service: Automation bot`).
- **Every token HTTP request** is stored in `api_access_log`, viewable at `GET /api/org/service-tokens/access-log` (org admin).

## Database migration

Deploy includes migration `0019_service_api_tokens.sql` (`user.account_kind`, `api_access_token`, `api_access_log`). Run `pnpm db:migrate` (see `scripts/deploy-production.sh`).

## Deploy: test vs live

Both environments use the same flow: pull branch → `pnpm install` → `pnpm db:migrate` → `pnpm build` → restart API → publish web static files (`scripts/deploy-production.sh`). Use the **test** host (`projecterp-test.pureautomation.com.au`) first; production (`projecterpgh.pureautomation.com.au`) follows the same script with that server’s `.env` and branch policy.
