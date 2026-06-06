# Cobalt + yt-dlp (satu URL, tanpa env baru di Vercel)

YouTube sering gagal remux di Cobalt saja. Paket ini menjalankan **Cobalt + yt-dlp** di **satu service Railway** dengan **URL yang sama** seperti Cobalt kamu sekarang.

## Yang perlu kamu lakukan (sekali saja)

1. Buka **Railway** → service **Cobalt** yang sudah ada (`cobalt-api-production-2f6c…`)
2. **Settings → Root Directory** → isi: `services/cobalt-ytdlp`
3. **Deploy** ulang (env Cobalt lama **biarkan**, jangan tambah env baru)
4. **Vercel VANDOR** — **TIDAK perlu** tambah `YTDLP_API_URL` / `YTDLP_API_KEY`
   - `COBALT_API_URL` tetap URL Railway yang sama

VANDOR otomatis coba Cobalt dulu, kalau remux gagal → `/ytdlp/download` di host yang sama.

## Opsional

Kalau Cobalt pakai `COBALT_API_KEY`, yt-dlp sidecar pakai key yang sama (`Api-Key` header).

## Test

```bash
curl "https://COBALT-URL-KAMU/ytdlp/health"
curl -o test.mp3 "https://COBALT-URL-KAMU/ytdlp/download?url=https://youtu.be/9so1ai5745s&format=audio"
```
