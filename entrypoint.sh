#!/usr/bin/env bash
set -euo pipefail

cd /app/apps/backend
pnpm exec drizzle-kit migrate
node dist/index.js &
backend=$!

cd /app/apps/frontend
PORT="${FRONTEND_PORT:-3001}" HOST=0.0.0.0 node build/index.js &
frontend=$!

wait -n
kill "$backend" "$frontend" 2>/dev/null || true
exit 1
