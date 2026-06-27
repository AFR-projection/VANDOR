#!/usr/bin/env bash
# VANDOR — perbarui yt-dlp ke versi terbaru (YouTube/TikTok sering butuh update)
set -euo pipefail

echo "==> yt-dlp update"
if command -v pip3 >/dev/null 2>&1; then
  pip3 install -U yt-dlp
elif command -v pip >/dev/null 2>&1; then
  pip install -U yt-dlp
else
  apt-get update -y
  apt-get install -y python3-pip
  pip3 install -U yt-dlp
fi

install -d /usr/local/bin
if ! command -v yt-dlp >/dev/null 2>&1; then
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
    -o /usr/local/bin/yt-dlp
  chmod a+rx /usr/local/bin/yt-dlp
fi

echo "==> ffmpeg"
if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ffmpeg
fi

echo ""
yt-dlp --version
ffmpeg -version | head -1
echo ""
echo "Selesai. Restart app: cd /var/www/vandor && pm2 restart vandor"
