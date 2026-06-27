#!/usr/bin/env bash
# VANDOR — arahkan domain ke app + SSL Let's Encrypt + update env + rebuild
#
# Usage:
#   bash deploy/hostinger/configure-domain.sh vandor.dataku.id email@example.com
#   bash deploy/hostinger/configure-domain.sh dataku.id email@example.com --www
#
# Sebelum jalankan: DNS A record domain → IP VPS (72.61.114.56), tunggu propagate.
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
INCLUDE_WWW="${3:-}"

if [[ -z "${DOMAIN}" ]]; then
  echo "Usage: bash deploy/hostinger/configure-domain.sh DOMAIN [EMAIL] [--www]"
  echo "Contoh: bash deploy/hostinger/configure-domain.sh vandor.dataku.id owner@dataku.id"
  exit 1
fi

APP_DIR="${VANDOR_APP_DIR:-/var/www/vandor}"
NGINX_SITE="/etc/nginx/sites-available/vandor"
ENV_FILE="${APP_DIR}/.env.local"

echo "==> Cek DNS ${DOMAIN}"
RESOLVED=$(dig +short "${DOMAIN}" A 2>/dev/null | head -1 || true)
if [[ -z "${RESOLVED}" ]]; then
  RESOLVED=$(getent ahostsv4 "${DOMAIN}" 2>/dev/null | awk '{print $1; exit}' || true)
fi
if [[ -z "${RESOLVED}" ]]; then
  RESOLVED=$(nslookup "${DOMAIN}" 8.8.8.8 2>/dev/null | awk '/^Address: / { print $2; exit }' || true)
fi
if [[ -z "${RESOLVED}" ]]; then
  echo "WARN: DNS belum resolve untuk ${DOMAIN}."
  echo "      Buat A record di panel domain → IP VPS, tunggu 5–30 menit, lalu jalankan ulang."
  read -r -p "Lanjutkan anyway? [y/N] " ans
  [[ "${ans}" =~ ^[Yy]$ ]] || exit 1
else
  echo "    ${DOMAIN} → ${RESOLVED}"
fi

echo "==> Nginx server_name → ${DOMAIN}"
if [[ ! -f "${NGINX_SITE}" ]]; then
  install -m 644 "${APP_DIR}/deploy/hostinger/nginx-vandor.conf" "${NGINX_SITE}"
  ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/vandor
fi

if [[ "${INCLUDE_WWW}" == "--www" ]]; then
  sed -i "s/^[[:space:]]*server_name .*/  server_name ${DOMAIN} www.${DOMAIN};/" "${NGINX_SITE}"
else
  sed -i "s/^[[:space:]]*server_name .*/  server_name ${DOMAIN};/" "${NGINX_SITE}"
fi

nginx -t
systemctl reload nginx

echo "==> Certbot SSL"
CERT_ARGS=(--nginx -d "${DOMAIN}" --redirect)
if [[ -n "${EMAIL}" ]]; then
  CERT_ARGS+=(--non-interactive --agree-tos -m "${EMAIL}")
fi
if [[ "${INCLUDE_WWW}" == "--www" ]]; then
  CERT_ARGS+=(-d "www.${DOMAIN}")
fi

certbot "${CERT_ARGS[@]}"

echo "==> Update .env.local"
if [[ -f "${ENV_FILE}" ]]; then
  sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://${DOMAIN}|" "${ENV_FILE}"
  sed -i "s|^OPENROUTER_APP_URL=.*|OPENROUTER_APP_URL=https://${DOMAIN}|" "${ENV_FILE}"
else
  echo "WARN: ${ENV_FILE} tidak ada — set manual:"
  echo "  NEXT_PUBLIC_APP_URL=https://${DOMAIN}"
  echo "  OPENROUTER_APP_URL=https://${DOMAIN}"
fi

echo "==> Rebuild & restart"
cd "${APP_DIR}"
bash deploy/hostinger/deploy.sh

echo ""
echo "Selesai. Buka https://${DOMAIN}"
echo "Gate login: https://${DOMAIN}/gate"
