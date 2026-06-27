#!/usr/bin/env bash
# VANDOR — first deploy on VPS (after setup-server.sh + .env.local)
set -euo pipefail

APP_DIR="${VANDOR_APP_DIR:-/var/www/vandor}"
GIT_REPO="${VANDOR_GIT_REPO:-}"

cd "${APP_DIR}"

if [[ ! -f package.json ]]; then
  if [[ -z "${GIT_REPO}" ]]; then
    echo "ERROR: ${APP_DIR} kosong. Set VANDOR_GIT_REPO atau clone manual:"
    echo "  git clone <repo-url> ${APP_DIR}"
    exit 1
  fi
  TMP_CLONE="$(mktemp -d)"
  git clone "${GIT_REPO}" "${TMP_CLONE}"
  cp -a "${TMP_CLONE}/." "${APP_DIR}/"
  rm -rf "${TMP_CLONE}"
fi

if [[ ! -f .env.local && ! -f .env.production ]]; then
  echo "ERROR: Buat ${APP_DIR}/.env.local dulu (lihat deploy/hostinger/env.template)"
  exit 1
fi

mkdir -p public/storage .whatsapp-auth

echo "==> Install dependencies"
pnpm install --frozen-lockfile

echo "==> Build (migrate + next build)"
pnpm run build

echo "==> Start PM2"
export VANDOR_APP_DIR="${APP_DIR}"
pm2 delete vandor 2>/dev/null || true
pm2 start deploy/hostinger/ecosystem.config.cjs
pm2 save

echo ""
echo "Deploy pertama selesai."
echo "  Health: curl http://127.0.0.1:3000/ping"
echo "  Web:    http://$(curl -4 -s ifconfig.me 2>/dev/null || echo 'IP-VPS')/gate"
