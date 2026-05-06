#!/usr/bin/env bash
set -euo pipefail

# Production deploy: pull, install, migrate, build, restart API, publish web dist.
#
# Defaults match a typical nginx + systemd layout. Override if needed:
#   PROJECTERP_WEB_ROOT=/var/www/projecterp \
#   PROJECTERP_API_UNIT=projecterp-api \
#   bash scripts/deploy-production.sh
#
# Skip DB migrate (e.g. maintenance window): SKIP_MIGRATE=1 bash scripts/deploy-production.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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
