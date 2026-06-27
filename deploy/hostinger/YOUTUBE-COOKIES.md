# YouTube di VPS — cookies wajib

YouTube memblokir unduhan otomatis dari IP datacenter (Hostinger, AWS, dll):

```
Sign in to confirm you're not a bot
```

**Solusi:** export cookies akun Google yang sudah login YouTube, simpan di VPS.

## Langkah (5 menit)

### 1. Di PC — install extension

Chrome/Edge: **[Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)**

### 2. Login YouTube

Buka [youtube.com](https://youtube.com) — pastikan sudah login akun Google.

### 3. Export cookies

- Klik extension → export untuk `youtube.com`
- Simpan file sebagai `youtube.txt`

### 4. Upload ke VPS

```powershell
scp C:\path\to\youtube.txt root@72.61.114.56:/var/www/vandor/cookies/youtube.txt
```

Atau buat folder dulu di VPS:

```bash
mkdir -p /var/www/vandor/cookies
chmod 700 /var/www/vandor/cookies
```

### 5. Env + restart

Di `/var/www/vandor/.env.local`:

```env
YOUTUBE_COOKIE_FILE=cookies/youtube.txt
```

```bash
chmod 600 /var/www/vandor/cookies/youtube.txt
cd /var/www/vandor && pm2 restart vandor
```

### 6. Test

```bash
yt-dlp --cookies /var/www/vandor/cookies/youtube.txt -f b "https://youtu.be/5hTHECYaRFQ" -o /tmp/test.mp4
```

Lalu di WhatsApp: `/ytv https://youtu.be/5hTHECYaRFQ`

## Perpanjang cookies

Cookies Google kadang expired (~2–4 minggu). Ulangi export + upload jika `/ytv` gagal lagi.

## TikTok

TikTok biasanya jalan tanpa cookies via yt-dlp. Jika gagal, jalankan:

```bash
bash deploy/hostinger/install-ytdlp.sh
```
