#!/usr/bin/env bash
# Bring the local PostgreSQL dev database up and apply migrations. Idempotent:
# safe to run on every boot and repeatedly during install. Matches the default
# DATABASE_URL used by the app (postgres://projecterp:projecterp@127.0.0.1:15432/projecterp),
# which mirrors the docker-compose Postgres the repo documents for local dev.
set -euo pipefail

PG_VERSION=16
PG_CLUSTER=main
PG_PORT=15432
DB_USER=projecterp
DB_PASS=projecterp
DB_NAME=projecterp

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Start the cluster only if it is not already accepting connections.
if ! pg_isready -h 127.0.0.1 -p "$PG_PORT" -q 2>/dev/null; then
  echo "Starting PostgreSQL cluster ${PG_VERSION}/${PG_CLUSTER} on port ${PG_PORT}..."
  sudo pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" start || true
fi

# Wait for readiness.
for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p "$PG_PORT" -q 2>/dev/null; then
    break
  fi
  sleep 1
done
if ! pg_isready -h 127.0.0.1 -p "$PG_PORT" -q 2>/dev/null; then
  echo "PostgreSQL did not become ready on port ${PG_PORT}" >&2
  exit 1
fi

# Ensure the application role and database exist.
if ! sudo -u postgres psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -p "$PG_PORT" -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';"
fi
if ! sudo -u postgres psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -p "$PG_PORT" -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi

# Apply schema migrations (drizzle-kit records applied migrations, so this is a no-op when current).
export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@127.0.0.1:${PG_PORT}/${DB_NAME}"
echo "Applying database migrations..."
pnpm --filter @project-erp/db db:migrate

echo "Database ready at ${DATABASE_URL}"
