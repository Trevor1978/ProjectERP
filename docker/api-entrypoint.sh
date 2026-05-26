#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
until pg_isready -d "${DATABASE_URL}" >/dev/null 2>&1; do
  sleep 2
done

echo "Running database migrations..."
cd /migrations
./node_modules/.bin/drizzle-kit migrate --config=drizzle.migrate.config.cjs

echo "Starting API..."
cd /app
exec node dist/index.js
