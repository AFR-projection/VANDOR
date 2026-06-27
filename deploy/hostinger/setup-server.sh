#!/usr/bin/env bash
# VANDOR — one-time Hostinger VPS setup (Ubuntu 24.04)
# Run as root: bash deploy/hostinger/setup-server.sh
set -euo pipefail

APP_DIR="${VANDOR_APP_DIR:-/var/www/vandor}"
NODE_MAJOR="${NODE_MAJOR:-22}"

echo "==> VANDOR Hostinger setup (Ubuntu)"
echo "    App directory: ${APP_DIR}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

apt-get install -y \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  ffmpeg \
  yt-dlp \
  ufw \
  build-essential

echo "==> Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> pnpm + PM2"
npm install -g pnpm pm2

echo "==> Firewall"
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable

mkdir -p "${APP_DIR}"
mkdir -p "${APP_DIR}/public/storage"
mkdir -p "${APP_DIR}/.whatsapp-auth"

echo "==> Nginx site template"
install -m 644 deploy/hostinger/nginx-vandor.conf /etc/nginx/sites-available/vandor
ln -sf /etc/nginx/sites-available/vandor /etc/nginx/sites-enabled/vandor
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> PM2 startup on boot"
pm2 startup systemd -u root --hp /root || true

echo ""
echo "Setup selesai."
echo "Langkah berikutnya:"
echo "  1. Clone repo ke ${APP_DIR} (atau upload kode)"
echo "  2. Salin env: cp deploy/hostinger/env.template ${APP_DIR}/.env.local"
echo "  3. Edit ${APP_DIR}/.env.local (POSTGRES_URL, AUTH_SECRET, owner, URL)"
echo "  4. cd ${APP_DIR} && bash deploy/hostinger/first-deploy.sh"
echo "  5. SSL (jika punya domain): certbot --nginx -d domain-kamu.com"
