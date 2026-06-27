#!/usr/bin/env bash
# VANDOR — update deploy (git pull + rebuild + restart)
set -euo pipefail

APP_DIR="${VANDOR_APP_DIR:-/var/www/vandor}"

cd "${APP_DIR}"

if [[ ! -f package.json ]]; then
  echo "ERROR: ${APP_DIR} bukan folder VANDOR. Jalankan first-deploy.sh dulu."
  exit 1
fi

if [[ -d .git ]]; then
  echo "==> git sync (origin/main)"
  git fetch origin
  git reset --hard origin/main
fi

echo "==> Install"
pnpm install --frozen-lockfile

echo "==> Build"
pnpm run build

echo "==> Restart PM2"
export VANDOR_APP_DIR="${APP_DIR}"
pm2 reload deploy/hostinger/ecosystem.config.cjs --update-env || pm2 start deploy/hostinger/ecosystem.config.cjs
pm2 save

echo "Deploy update selesai — $(date -Is)"
