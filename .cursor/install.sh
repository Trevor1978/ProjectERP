#!/usr/bin/env bash
# One-time repository bootstrap for Cloud Agents. Idempotent and terminates.
# Self-provisioning: installs PostgreSQL if the base image lacks it, so this
# works on Cursor's default image without a custom snapshot/Dockerfile.
set -euo pipefail

PG_VERSION=16
PG_PORT=15432

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "== Ensuring PostgreSQL ${PG_VERSION} is installed =="
if ! command -v psql >/dev/null 2>&1 || ! command -v pg_ctlcluster >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -qq
  sudo apt-get install -y -qq "postgresql-${PG_VERSION}" "postgresql-client-${PG_VERSION}"
fi

# The repo's default DATABASE_URL / docker-compose Postgres uses port 15432, so
# point the default cluster there. pg_conftool only edits config; db-up.sh starts it.
if sudo pg_lsclusters -h 2>/dev/null | awk '{print $1"/"$2}' | grep -qx "${PG_VERSION}/main"; then
  sudo pg_conftool "${PG_VERSION}" main set port "${PG_PORT}"
fi

echo "== Installing workspace dependencies =="
pnpm install --frozen-lockfile

echo "== Building workspace packages (validators, db, api, web) =="
pnpm run build

echo "== Installing Playwright browser (chromium) =="
pnpm exec playwright install --with-deps chromium

echo "== Preparing local PostgreSQL database =="
bash "${repo_root}/.cursor/db-up.sh"

echo "Install complete."
