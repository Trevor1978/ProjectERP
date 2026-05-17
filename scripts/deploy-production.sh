#!/usr/bin/env bash
set -euo pipefail

# Production deploy: pull, install, migrate, build, restart API, publish web dist.
#
# Loads the repository root `.env` when present so DATABASE_URL is available to drizzle-kit and the build.
# Defaults match a typical nginx + systemd layout. Override if needed:
#   PROJECTERP_WEB_ROOT=/var/www/projecterp \
#   PROJECTERP_API_UNIT=projecterp-api \
#   bash scripts/deploy-production.sh
#
# Skip DB migrate (e.g. maintenance window): SKIP_MIGRATE=1 bash scripts/deploy-production.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Export variables from repo .env so migrate/build see DATABASE_URL, VITE_*, etc.
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

BRANCH="${1:-main}"
WEB_ROOT="${PROJECTERP_WEB_ROOT:-/var/www/projecterp}"
API_UNIT="${PROJECTERP_API_UNIT:-projecterp-api}"

echo "==> Repo: $ROOT_DIR"
echo "==> Branch: $BRANCH"
echo "==> Web root: $WEB_ROOT"
echo "==> systemd unit: $API_UNIT"

git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> pnpm install (frozen lockfile)"
pnpm install --frozen-lockfile

if [[ "${SKIP_MIGRATE:-}" != "1" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL is not set. Add it to $ROOT_DIR/.env (see .env.example) or export it before running this script." >&2
    exit 1
  fi
  echo "==> db:migrate"
  pnpm db:migrate
else
  echo "==> Skipping db:migrate (SKIP_MIGRATE=1)"
fi

echo "==> build (validators, db, api, web)"
pnpm run build

echo "==> restart API ($API_UNIT)"
sudo systemctl restart "$API_UNIT"

echo "==> rsync web dist -> $WEB_ROOT"
sudo rsync -a --delete "$ROOT_DIR/apps/web/dist/" "$WEB_ROOT/"

echo "==> Done."
