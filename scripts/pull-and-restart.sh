#!/usr/bin/env bash
set -euo pipefail

# Local dev only: pull, pnpm install, kill :3001/:5173, start `pnpm dev` (Vite + tsx).
# For production (build + systemd + nginx static): use scripts/deploy-production.sh
#
# Default: restart in background, logs in ./.run/dev.log

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/dev.pid"
LOG_FILE="$RUN_DIR/dev.log"
FOREGROUND=0
BRANCH="${1:-main}"

if [[ "${1:-}" == "--foreground" ]]; then
  FOREGROUND=1
  BRANCH="${2:-main}"
fi

echo "==> Repo: $ROOT_DIR"
echo "==> Updating branch: $BRANCH"

git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Installing dependencies"
pnpm install

mkdir -p "$RUN_DIR"

stop_pid() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    echo "==> Stopping PID $pid"
    kill "$pid" || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      echo "==> Force stopping PID $pid"
      kill -9 "$pid" || true
    fi
  fi
}

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]]; then
    stop_pid "$OLD_PID"
  fi
  rm -f "$PID_FILE"
fi

echo "==> Clearing listeners on :3001 and :5173"
PIDS="$(lsof -t -nP -iTCP:3001 -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PIDS" ]]; then
  # shellcheck disable=SC2086
  kill $PIDS || true
fi
PIDS="$(lsof -t -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PIDS" ]]; then
  # shellcheck disable=SC2086
  kill $PIDS || true
fi
sleep 1

if [[ "$FOREGROUND" -eq 1 ]]; then
  echo "==> Starting app in foreground"
  exec pnpm dev
else
  echo "==> Starting app in background"
  nohup pnpm dev >"$LOG_FILE" 2>&1 &
  NEW_PID=$!
  echo "$NEW_PID" > "$PID_FILE"
  echo "==> Started. PID: $NEW_PID"
  echo "==> Log: $LOG_FILE"
fi
