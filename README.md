# VANDOR v3.3 — Personal AI Assistant

Lihat [CHANGELOG.md](./CHANGELOG.md) untuk riwayat rilis.

VANDOR adalah asisten pribadi (gaya Jarvis) berbasis **Next.js 16**, **OpenRouter**, **Neon Postgres** + **pgvector**, dan **AI SDK**. Satu pemilik, login PIN numpad, memori jangka panjang, berangkas terenkripsi, WhatsApp bridge, dan pengaturan dari UI.

## Fitur utama

| Fitur | Deskripsi |
|-------|-----------|
| **Chat multi-model** | OpenRouter — model gratis (`:free`) hingga flagship, pilih di UI |
| **Keamanan** | Login PIN 4 digit (numpad), **satu perangkat aktif**, riwayat login di pengaturan |
| **Memory v2** | Embedding + pgvector, ekstraksi otomatis, visual memory, kelola dari UI |
| **Agent Skills** | Skill/tool modular dari UI — HTTP API, knowledge base, web search, database, workflow, kalkulator parlay |
| **CS Mix Parlay** | Upload screenshot tiket → hitung actual odds (W/WH/LH/D) → kartu balasan CS **salin sekali klik** |
| **Berangkas (Vault)** | File terenkripsi di Cloudflare R2, PIN unlock, mode vault di chat |
| **WhatsApp** | Chat dengan VANDOR lewat WhatsApp (bridge terpisah, owner-only) |
| **Rich answers** | Web search (Tavily / fallback), kartu sumber, galeri, peta |
| **Pengaturan UI** | Gaya bicara AI, API keys terenkripsi, PIN, model embedding — tanpa edit `.env` untuk API |
| **Artifacts** | Dokumen/kode/sheet di panel samping + export PDF/DOCX/XLSX |

## Agent Skills

Skill modular yang bisa diaktifkan/nonaktifkan dari **Pengaturan → Agent Skills**. Setiap skill diekspos ke model sebagai tool dinamis (`skill_<slug>`) saat chat.

| Tipe skill | Fungsi |
|------------|--------|
| `web_search` | Pencarian web (built-in) |
| `knowledge_base` | RAG dari dokumen yang diunggah (PDF, DOCX, TXT, CSV, JSON) |
| `http_api` | Panggil REST API eksternal dengan parameter terdefinisi |
| `database` | Query SQL read-only (MySQL/Postgres) |
| `workflow` | Alur multi-step sederhana |
| `parlay_calculator` | Kalkulator Mix Parlay untuk CS |

**Built-in skills** (auto-seed saat chat pertama):

- `web_search_agent` — cari berita, harga, skor live
- `knowledge_base_search` — jawab dari dokumen internal
- `cs_mix_parlay` — hitung return tiket parlay dari screenshot

Panel skills juga menyediakan: log eksekusi, API keys per skill, upload dokumen knowledge base, dan tombol uji skill.

Modul: `lib/agent-skills/` · UI: `components/settings/agent-skills-panel.tsx`

## CS Mix Parlay Calculator

Workflow untuk customer service taruhan olahraga:

1. Upload **screenshot/foto tiket** Mix Parlay ke chat
2. Agent membaca Ref No (`PAR…`), nominal bet, odds asli (3 desimal), status **W / WH / LH / D**
3. Tool `skill_cs_mix_parlay` menghitung actual odds & payout
4. UI menampilkan kartu **Balasan CS · Mix Parlay** dengan tombol **Salin balasan**

Format output (contoh):

```
PAR17124504288

NO | ODDS AWAL  | WIN LOSE 

Odds 1.890 → WIN = 1.890
Odds 1.950 → DRAW (tidak dihitung)
...

Perhitungan Actual Odds:
1.890 × 1.850 × 2.080 × 1.870 × 0.500 = 6.800

Bet : Rp506
Actual odds : 6.800

506 × 6.800 = Rp3,440.8

Penjelasan : ...
```

**Hemat token:** setelah kartu tampil, agent tidak menulis ulang perhitungan di bawah (UI + instruksi tool menekan duplikasi).

Logika: `lib/agent-skills/parlay-calculator.ts` · Kartu: `components/chat/parlay-cs-card.tsx`

## Keamanan

1. **Login PIN (numpad)** — Halaman `/gate`, 4 digit. Sesi bertahan **30 hari** (atur via `VANDOR_GATE_TTL_SECONDS`). Tidak terikat IP — aman saat jaringan/VPN berubah.
2. **Satu perangkat** — Login PIN di perangkat baru otomatis logout perangkat lama (~20 detik). Cookie perangkat + sesi DB; akhiri sesi manual dari **Pengaturan → Keamanan → Riwayat login**.
3. **Owner tunggal** — `VANDOR_OWNER_EMAIL` / `PASSWORD`; register dinonaktifkan.
4. **Rate limit** — 3x PIN salah → blokir perangkat 1 jam.
5. **Berangkas** — Blob terenkripsi di R2; akses unduh butuh PIN vault (sesi unlock terbatas).

Akses utama lewat **PIN gate** (bukan IP allowlist).

## Tools AI (hanya yang real)

Semua tool di bawah ini punya implementasi server (`lib/ai/tools/`):

- `getCurrentTime`, `getLocation`, `getWeather`, `showMap`
- `webSearch` (Tavily / DuckDuckGo + Wikipedia)
- `saveMemory`, `getMemory`, `searchDb`, `manageNotes`, `updateTask`
- Slash skills: `/catat`, `/catatan`, `/baca`, `/todo`, `/ingat`, `/cari`, `/cuaca`, …
- `createDocument`, `editDocument`, `updateDocument`, `requestSuggestions`
- `createPdf`, `createDocx`, `createSpreadsheet`, `generateImage`
- **Vault:** upload, buka, unduh, cari file berangkas (mode vault di chat)
- **Agent Skills:** tool dinamis `skill_*` dari skill aktif di database

Model **tidak boleh** mengarang nama tool lain (daftar inti di `lib/ai/tools/registry.ts`; skill dinamis dari `lib/agent-skills/build-tools.ts`).

## Setup lokal (Windows)

### Prasyarat

- Node.js 20+
- [Neon](https://neon.tech) + connection string
- [OpenRouter](https://openrouter.ai) API key (bisa juga lewat UI setelah jalan)

### Environment

Salin `.env.example` → `.env.local`:

```env
AUTH_SECRET=                         # openssl rand -base64 32
POSTGRES_URL=postgresql://...@neon.tech/...?sslmode=require

VANDOR_NUMPAD_PIN=1234               # 4 digit — gate
VANDOR_OWNER_EMAIL=boss@vandor.local
VANDOR_OWNER_PASSWORD=password-kuat

OPENROUTER_API_KEY=sk-or-v1-...      # opsional jika isi lewat Pengaturan UI
OPENROUTER_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

VANDOR_GATE_TTL_SECONDS=3600
VANDOR_DISABLE_MESSAGE_LIMIT=true

# WhatsApp bridge (opsional)
WHATSAPP_OWNER_NUMBERS=628123456789
WHATSAPP_BRIDGE_SECRET=

# Cloudflare R2 — berangkas vault (opsional, disarankan production)
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET_NAME=
```

**Tetap wajib di `.env`:** `AUTH_SECRET`, `POSTGRES_URL`, owner, PIN (atau PIN dari UI DB).

**Bisa dari UI:** OpenRouter key, Tavily, gaya bicara, model embedding, PIN baru (terenkripsi), agent skills.

### Install & jalankan

```powershell
cd "C:\Users\User\Documents\VANDOR"
npm.cmd install --legacy-peer-deps
npm.cmd run db:migrate
npm.cmd run dev
```

Buka **http://localhost:3000** → `/gate` → PIN → chat.

### Production build

```powershell
npm.cmd run build
```

## Deploy ke Vercel

1. Push repo ke GitHub (jangan commit `.env.local`).
2. Vercel → Import → Framework **Next.js**.
3. **Environment Variables** (Production) — sama seperti `.env.local`, ganti URL:

```env
NEXT_PUBLIC_APP_URL=https://nama-projek.vercel.app
OPENROUTER_APP_URL=https://nama-projek.vercel.app
```

4. Deploy. Log build harus: `Migrations completed`.
5. Tes: `/gate` → PIN → chat → **Pengaturan** (Agent Skills, Berangkas, WhatsApp).

| Variabel | Wajib di Vercel |
|----------|-----------------|
| `AUTH_SECRET` | Ya |
| `POSTGRES_URL` | Ya (juga untuk migrasi saat build) |
| `VANDOR_OWNER_EMAIL` / `PASSWORD` | Ya |
| `VANDOR_NUMPAD_PIN` | Ya (fallback; bisa ganti di UI) |
| `NEXT_PUBLIC_APP_URL` | Ya |
| `OPENROUTER_API_KEY` | Opsional (UI) |
| `R2_*` | Opsional (wajib untuk vault cloud) |
| `WHATSAPP_*` | Opsional (bridge WhatsApp) |

Opsional file upload chat: `BLOB_READ_WRITE_TOKEN` (Vercel Blob) — tanpa ini export file pakai `public/storage` lokal.

## Deploy ke Hostinger VPS (disarankan — WhatsApp 24/7)

VPS Ubuntu (KVM) menjalankan **semua fitur** VANDOR: AI agent, memori, berangkas R2, WhatsApp QR tanpa bridge, unduh media via **yt-dlp**.

Database tetap **Neon Postgres** (external) — tidak perlu Postgres di VPS.

### Ringkas (5 langkah)

1. SSH ke VPS: `ssh root@IP-VPS`
2. Clone repo ke `/var/www/vandor` (atau upload kode)
3. Setup server (sekali): `bash deploy/hostinger/setup-server.sh`
4. Env: `cp deploy/hostinger/env.template /var/www/vandor/.env.local` → edit URL & secrets
5. Deploy: `cd /var/www/vandor && bash deploy/hostinger/first-deploy.sh`

Update berikutnya: `bash deploy/hostinger/deploy.sh`

### Env wajib di VPS

```env
AUTH_SECRET=                          # openssl rand -base64 32
POSTGRES_URL=postgresql://...@neon.tech/...?sslmode=require
VANDOR_OWNER_EMAIL=...
VANDOR_OWNER_PASSWORD=...
VANDOR_NUMPAD_PIN=1234
NEXT_PUBLIC_APP_URL=http://IP-ATAU-DOMAIN
OPENROUTER_APP_URL=http://IP-ATAU-DOMAIN
```

API keys (OpenRouter, R2, Tavily) bisa lewat **Pengaturan → API & integrasi** setelah jalan.

**HTTP tanpa SSL (`http://IP`):** login & chat jalan — BotID otomatis dimatikan. Setelah pakai HTTPS, BotID aktif lagi (lebih aman).

### Domain + SSL (contoh `dataku.id`)

1. **DNS** — di panel domain (Hostinger/Cloudflare), buat **A record**:
   - `vandor` → `IP-VPS` (subdomain `vandor.dataku.id`), **atau**
   - `@` → `IP-VPS` (root `dataku.id`)
   - Proxy Cloudflare: **DNS only** (grey cloud) saat pertama kali certbot, atau pakai Full SSL

2. **Tunggu propagate** (~5–30 menit), cek: `dig +short vandor.dataku.id`

3. **Di VPS** (setelah `git pull` / deploy fix terbaru):

```bash
cd /var/www/vandor
bash deploy/hostinger/configure-domain.sh vandor.dataku.id email@dataku.id
```

Untuk root + www:

```bash
bash deploy/hostinger/configure-domain.sh dataku.id email@dataku.id --www
```

Script otomatis: nginx → certbot → update `.env.local` → rebuild PM2.

### SSL manual (alternatif)

```bash
bash deploy/hostinger/setup-ssl.sh vandor.dataku.id email@dataku.id
cd /var/www/vandor && bash deploy/hostinger/deploy.sh
```

### Fitur di VPS vs Vercel

| Fitur | Hostinger VPS |
|-------|---------------|
| AI agent / chat | ✅ |
| Memory pgvector | ✅ (Neon) |
| Berangkas R2 | ✅ |
| WhatsApp QR + bot 24/7 | ✅ (tanpa bridge Railway) |
| Unduh `/tt` `/ig` | ✅ yt-dlp + TikWM (WA kirim langsung) |

**Unduh TikTok gagal?** Perbarui yt-dlp: `bash deploy/hostinger/install-ytdlp.sh`

| Agent Skills / Parlay | ✅ |

### PM2 & log

```bash
pm2 status
pm2 logs vandor
pm2 restart vandor
```

Health check: `curl http://127.0.0.1:3000/ping`

### Docker (alternatif)

```bash
cp deploy/hostinger/env.template .env.local   # edit dulu
docker compose up -d --build
```

Nginx tetap proxy ke port `3000`.

### File deploy

```
deploy/hostinger/
  setup-server.sh    # apt, node, nginx, yt-dlp, pm2
  first-deploy.sh    # install + build + pm2 start
  deploy.sh          # git pull + rebuild + restart
  ecosystem.config.cjs
  nginx-vandor.conf
  env.template
```

### Unduh media (`/tt`, `/ig`)

| Platform | Slash | Catatan |
|----------|-------|---------|
| TikTok | `/tt <url>` | VPS: yt-dlp → TikWM. WA: video langsung ke chat |
| Instagram | `/ig <url>` | Butuh Cobalt instance atau yt-dlp |
| YouTube | — | **Tidak didukung** (Google blokir IP server) |

Contoh: `/tt https://vt.tiktok.com/...`

## VANDOR v4 (speed & token efficiency)

- **Command-first**: `/cuaca`, `/waktu`, `/catatan`, `/todo …`, `/cari`, `/tt` → jalankan tool/code langsung (**0 token** LLM utama).
- **Dynamic tool loading**: maks. ~5 tool inti aktif per request + skill dinamis yang relevan.
- **Memory cap**: top 5 memori, ~3k karakter context.
- **Chat trim**: 10 pesan terakhir + conversation summary (bukan full history).
- **Instant status**: UI "Sedang …" <300ms sebelum stream LLM.
- **Agent loop**: maks. 4 step tool (hard cap).
- **Parlay CS**: hasil final di kartu UI — agent tidak mengulang teks balasan (hemat output token).

Modul: `lib/v4/` (`intent`, `tool-router`, `commands`, `fast-stream`, `model-pick`, `overhead`, cache cuaca).

**Hemat token tambahan:** skip polish & pre-extract untuk chat simpel; model cepat untuk intent ringan; output cap 512 token (simple) / 2048 (enhanced); cuaca di-cache 15 menit.

## Struktur penting

```
app/
  gate/                    # PIN numpad
  (chat)/                  # Chat + settings + API vault/whatsapp/skills
  api/auth/                # NextAuth routes
lib/
  agent-skills/            # Skill modular, parlay calculator, KB, runner
  ai/tools/                # Tool implementations
  memory/                  # pgvector, extract, visual
  security/                # Gate, vault unlock, client-access
  settings/                # Persona + secrets (encrypted)
  vault/                   # R2 storage, queries, scope
  whatsapp/                # Bridge manager, ingest, outbound
  v4/                      # Intent, commands, tool router
components/
  chat/parlay-cs-card.tsx  # Kartu salin balasan CS parlay
  settings/
    agent-skills-panel.tsx
    vault-panel.tsx
    whatsapp-panel.tsx
proxy.ts                   # Gate pada setiap request
```

## Scripts

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | Dev server |
| `npm run build` | Migrasi + production build |
| `npm run db:migrate` | Jalankan migrasi SQL |
| `npm run db:studio` | Drizzle Studio |

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Gate / sesi | Cek cookie gate + `POSTGRES_URL`; lihat Pengaturan → Riwayat login |
| PIN lagi setelah ganti jaringan | Normal — gate terikat perangkat; masukkan PIN |
| `Login owner gagal` | Cek `VANDOR_OWNER_EMAIL` / `PASSWORD` |
| Build gagal migrasi | Set `POSTGRES_URL` di Vercel sebelum build |
| Memory tidak jalan | Migrasi + extension `vector` di Neon |
| OpenRouter 402 | Tambah kredit atau pilih model `:free` |
| Agent Skills kosong / error | Jalankan `npm run db:migrate`; buka chat sekali (auto-seed built-in) |
| Parlay tidak muncul kartu | Pastikan skill `cs_mix_parlay` aktif di Pengaturan → Agent Skills |
| Vault upload gagal | Set `R2_*` di env; cek Pengaturan → Berangkas |
| WhatsApp tidak connect | Di VPS: Pengaturan → WhatsApp → Sambungkan (scan QR). Di Vercel: pakai bridge `services/whatsapp-bridge/` |

## Lisensi

Berdasarkan template Chatbot (AI SDK). VANDOR — modifikasi pribadi.
