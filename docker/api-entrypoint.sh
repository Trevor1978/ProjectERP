#!/bin/sh
set -e

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "POSTGRES_PASSWORD is required" >&2
  exit 1
fi

# Build DATABASE_URL with URL-encoded credentials (password may contain %, &, etc.)
export DATABASE_URL=$(node -e "
const user = process.env.POSTGRES_USER || 'projecterp';
const pass = process.env.POSTGRES_PASSWORD;
const host = process.env.POSTGRES_HOST || 'postgres';
const db = process.env.POSTGRES_DB || 'projecterp';
console.log(
  'postgres://' +
  encodeURIComponent(user) + ':' +
  encodeURIComponent(pass) + '@' +
  host + ':5432/' + db
);
")

export PGPASSWORD="${POSTGRES_PASSWORD}"

echo "Waiting for PostgreSQL..."
until pg_isready -h "${POSTGRES_HOST:-postgres}" -p 5432 \
  -U "${POSTGRES_USER:-projecterp}" -d "${POSTGRES_DB:-projecterp}" >/dev/null 2>&1; do
  sleep 2
done

echo "Running database migrations..."
cd /migrations
./node_modules/.bin/drizzle-kit migrate --config=drizzle.migrate.config.cjs

echo "Starting API..."
cd /app
exec node dist/index.js
