#!/bin/sh
set -e
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-projecterp}"

until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q; do
  echo "api-entrypoint: waiting for postgres at ${PGHOST}:${PGPORT}..."
  sleep 1
done

echo "api-entrypoint: running database migrations..."
cd /app/node_modules/@project-erp/db
npx --no-install drizzle-kit migrate

echo "api-entrypoint: starting API..."
cd /app
exec node dist/index.js
