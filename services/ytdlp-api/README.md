# VANDOR yt-dlp API (standalone)

> **Lebih mudah:** pakai `services/cobalt-ytdlp` — gabung Cobalt + yt-dlp, **tanpa env baru di Vercel**.

Service standalone ini hanya jika kamu mau yt-dlp terpisah dari Cobalt.

## Deploy (Railway)

1. New service → Deploy from repo, root directory `services/ytdlp-api`
2. Env:
   - `API_KEY` — random secret (same value as `YTDLP_API_KEY` in Vercel)
   - `MAX_BYTES` — optional, default 83886080 (80 MB)
3. Copy public URL → set in Vercel: `YTDLP_API_URL=https://your-service.up.railway.app`

## Local test

```bash
cd services/ytdlp-api
pip install -r requirements.txt
python server.py
curl -o test.mp3 "http://localhost:8080/download?url=https://youtu.be/9so1ai5745s&format=audio"
```
