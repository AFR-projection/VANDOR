#!/bin/sh
set -e

COBALT_PORT="${COBALT_PORT:-9000}"
YTDLP_PORT="${YTDLP_PORT:-8081}"

cd /cobalt
node src/cobalt &
COBALT_PID=$!

python3 /ytdlp/ytdlp-server.py &
YTDLP_PID=$!

cleanup() {
  kill "$COBALT_PID" "$YTDLP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 2
exec node /app/proxy.mjs
