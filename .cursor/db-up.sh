#!/usr/bin/env bash
set -euo pipefail
if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "PostgreSQL already running on 5432"
  exit 0
fi
if command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main start || sudo pg_ctlcluster 15 main start || true
fi
pg_isready -h 127.0.0.1 -p 5432