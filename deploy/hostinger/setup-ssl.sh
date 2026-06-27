#!/usr/bin/env bash
# VANDOR — aktifkan HTTPS via Let's Encrypt (Certbot + Nginx)
# Usage: bash deploy/hostinger/setup-ssl.sh domain-kamu.com [email@example.com]
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "${DOMAIN}" ]]; then
  echo "Usage: bash deploy/hostinger/setup-ssl.sh domain-kamu.com [email@example.com]"
  exit 1
fi

APP_DIR="${VANDOR_APP_DIR:-/var/www/vandor}"
ENV_FILE="${APP_DIR}/.env.local"

echo "==> Certbot SSL for ${DOMAIN}"
if [[ -n "${EMAIL}" ]]; then
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect
else
  certbot --nginx -d "${DOMAIN}"
fi

echo "==> Update NEXT_PUBLIC_APP_URL to HTTPS"
if [[ -f "${ENV_FILE}" ]]; then
  sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://${DOMAIN}|" "${ENV_FILE}"
  sed -i "s|^OPENROUTER_APP_URL=.*|OPENROUTER_APP_URL=https://${DOMAIN}|" "${ENV_FILE}"
  echo "    Updated ${ENV_FILE}"
  echo "    Rebuild app: cd ${APP_DIR} && bash deploy/hostinger/deploy.sh"
else
  echo "    .env.local not found — set manually:"
  echo "    NEXT_PUBLIC_APP_URL=https://${DOMAIN}"
  echo "    OPENROUTER_APP_URL=https://${DOMAIN}"
fi

echo ""
echo "SSL aktif. Pastikan DNS A record ${DOMAIN} → IP VPS sudah propagate."
