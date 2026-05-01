# Deploying Project ERP on Coolify

This guide walks through deploying the **Docker Compose** stack defined in `docker-compose.prod.yml`: **Postgres** (container), **API** (Node), and **web** (nginx static SPA + reverse proxy to the API on `/api`).

Coolify’s UI changes slightly between versions; the flow below matches **Coolify v4** concepts (project → environment → resource → Docker Compose from Git). If a label differs on your server, look for the same idea (compose file, services, domains, environment variables).

---

## What you are deploying

| Service    | Role |
|-----------|------|
| `postgres` | PostgreSQL 16; data in Docker volume `postgres_data`. |
| `api`      | Hono API on port **3001** inside the network only (`expose`, not published). |
| `web`      | nginx on port **80**: serves the React app and proxies **`/api`** → `api:3001`. |

The browser only talks to **`web`**. API calls go to **`https://your-domain/api/...`**, so session cookies stay on **one origin** (important for login).

---

## Before you start

1. **Git**: Code is pushed to a repository Coolify can clone (GitHub, Gitea, etc.), including:
   - `docker-compose.prod.yml`
   - `docker/` (Dockerfiles, nginx config, entrypoint)
   - `packages/db/drizzle/` (migrations)

2. **DNS** (for a custom domain): An **A (or AAAA) record** pointing your hostname at the Coolify host’s public IP (or whatever your docs say for your setup).

3. **Secrets ready** (you will paste them in Coolify):
   - A long random **`SESSION_SECRET`** (at least 32 characters).
   - A strong **`POSTGRES_PASSWORD`** using only characters safe in a URL, or you must **URL-encode** the password in `DATABASE_URL` manually (see [Postgres password gotcha](#postgres-password-and-database_url)).

---

## Step 1: Create the resource

1. Open **Coolify** → your **Project** → the **Environment** (e.g. `production`).
2. **Add resource** → choose **Docker Compose** (wording may be “Docker Compose” or “Service Stack”).
3. Connect **Git**: pick the repo and branch that contain this project.
4. Set the **Compose file path** to:
   ```text
   docker-compose.prod.yml
   ```
5. Save. Coolify should **parse the compose file** and list services: `postgres`, `api`, `web`.

---

## Step 2: Environment variables

Coolify scans `${...}` in the compose file and shows variables in the **Environment variables** (or **Configuration**) section. Set **at least** these **before** the first successful deploy:

| Variable | Required | What to enter |
|----------|----------|----------------|
| `POSTGRES_PASSWORD` | **Yes** | Strong password; avoid `@ : / ? #` unless you know how to encode (see below). |
| `SESSION_SECRET` | **Yes** | Long random string (32+ chars). |
| `WEB_ORIGIN` | **Yes** | The **exact origin** users use in the browser, including scheme: `https://erp.example.com` **no trailing slash**. Must match the domain you attach to **`web`** once TLS is enabled. |

Optional (defaults exist in compose):

| Variable | Default | Notes |
|----------|---------|--------|
| `POSTGRES_USER` | `projecterp` | Must stay in sync if you change it. |
| `POSTGRES_DB` | `projecterp` | Database name. |

**`WEB_ORIGIN` detail:** The API uses this for CORS logging and as a fallback. If it does not match the real site URL (including `https://`), you can see odd cookie or CORS behavior. After you know the final URL, set `WEB_ORIGIN` to that origin and **redeploy** so the `api` container picks it up.

**Coolify “magic” variables (optional):** If your Coolify version documents **SERVICE_URL_*** / **SERVICE_FQDN_*** for compose stacks, you can sometimes set `WEB_ORIGIN` to the generated public URL for the **`web`** service instead of typing it by hand. That only works if your Coolify injects those variables into the stack; if unsure, set `WEB_ORIGIN` manually to your `https://...` URL.

---

## Step 3: Domain and SSL (attach to `web` only)

1. Open the **Docker Compose** resource → find the **`web`** service (not `api`, not `postgres`).
2. Assign **FQDN / Domain**: e.g. `https://erp.example.com`.
3. Let Coolify issue **Let’s Encrypt** (or your usual TLS method).

**Important:**

- The compose file maps **`80:80`** on **`web`**. Coolify’s proxy usually terminates HTTPS and forwards to the container; port **80** inside **`web`** is correct for this project.
- **Do not** expose the **`api`** service on a separate public domain unless you change the frontend to use `VITE_API_URL` and fix cross-origin cookies. The supported setup is **only** the **`web`** service on the public URL.

---

## Step 4: Deploy

1. Click **Deploy** (or **Save & Deploy**).
2. First deploy **builds two images** (`api`, `web`) and pulls Postgres; it can take **several minutes**.
3. Watch logs for **`api`**:
   - It waits for Postgres, runs **`drizzle-kit migrate`**, then starts the server.
   - If migrations fail, the container may restart; check logs for SQL or connection errors.

---

## Step 5: Smoke tests

After deploy and TLS:

1. Open `https://your-domain/` — you should get the SPA (not nginx default only).
2. Check API through the proxy:
   ```bash
   curl -sS https://your-domain/api/health
   ```
   Expected JSON: `{"ok":true,"service":"project-erp-api"}`.
3. In the browser, try **register** / **login**. If the UI loads but login never sticks, re-check **`WEB_ORIGIN`**, **`NODE_ENV=production`**, and that you are on **`https://`** (secure cookies).

---

## Postgres password and `DATABASE_URL`

Compose builds:

```text
postgres://POSTGRES_USER:POSTGRES_PASSWORD@postgres:5432/POSTGRES_DB
```

Characters like `@`, `:`, `/` in the password **break** this URL. Easiest fix: use a long alphanumeric password. If you must use special characters, URL-encode the password or set a custom `DATABASE_URL` in Coolify (advanced; would require adjusting the compose file to use it consistently for Postgres and `api`).

---

## Troubleshooting

| Symptom | Things to check |
|--------|-------------------|
| **502 / 504** on `/api/health` | `api` not running: logs show migration errors or DB connection failure. Confirm `postgres` is healthy and `POSTGRES_PASSWORD` matches. |
| SPA loads, API 404 on `/api` | Domain attached to wrong service; must be **`web`**. nginx proxies `/api` to `api:3001`. |
| Login fails or session not kept | `WEB_ORIGIN` must match the live `https://` URL; use HTTPS in production (`NODE_ENV=production` sets secure cookies). |
| Build fails on Git | Coolify server must have Docker buildx, enough disk/RAM; confirm branch has `docker/` and `docker-compose.prod.yml`. |
| “Variable required” in UI | Fill `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `WEB_ORIGIN` (or whatever the compose marks with `:?`). |

---

## Updating the app

- Push commits to the connected branch → **Redeploy** in Coolify (or use **webhooks** if you enabled them).
- New **database migrations** in `packages/db/drizzle/` run automatically when **`api`** starts (`npx drizzle-kit migrate` in the entrypoint).

---

## Reference: variable flow

- **`web`**: Built with **`VITE_API_URL` empty** so the browser calls relative **`/api/...`** (same origin as the page).
- **`api`**: `DATABASE_URL` is **not** set manually in Coolify for the default setup; compose builds it from `POSTGRES_*` and the hostname **`postgres`** (Docker DNS service name).

---

## Further reading

- [Coolify: Docker Compose](https://coolify.io/docs/knowledge-base/docker/compose)  
- [Coolify: Environment variables](https://coolify.io/docs/knowledge-base/environment-variables)  
