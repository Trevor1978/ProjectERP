#!/usr/bin/env bash
# One-time repository bootstrap for Cloud Agents. Idempotent and terminates.
# System packages (PostgreSQL, Chromium OS libs) come from the base snapshot/image.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "== Installing workspace dependencies =="
pnpm install --frozen-lockfile

echo "== Building workspace packages (validators, db, api, web) =="
pnpm run build

echo "== Installing Playwright browser (chromium) =="
pnpm exec playwright install chromium

echo "== Preparing local PostgreSQL database =="
bash "$repo_root/.cursor/db-up.sh"

echo "Install complete."
