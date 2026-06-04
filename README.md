# VANDOR v3.2 — Personal AI Assistant

Lihat [CHANGELOG.md](./CHANGELOG.md) untuk riwayat rilis.

VANDOR adalah asisten pribadi (gaya Jarvis) berbasis **Next.js 16**, **OpenRouter**, **Neon Postgres** + **pgvector**, dan **AI SDK**. Satu pemilik, login PIN numpad, memori jangka panjang, dan pengaturan dari UI.

## Fitur utama

| Fitur | Deskripsi |
|-------|-----------|
| **Chat multi-model** | OpenRouter — model gratis (`:free`) hingga flagship, pilih di UI |
| **Keamanan** | Login PIN 4 digit (numpad), **satu perangkat aktif**, riwayat login di pengaturan |
| **Memory v1** | Embedding + pgvector, ekstraksi otomatis, visual memory |
| **Rich answers** | Web search (Tavily / fallback), kartu sumber, galeri, peta |
| **Pengaturan UI** | Gaya bicara AI, API keys terenkripsi, PIN, model embedding — tanpa edit `.env` untuk API |
| **Pengaturan Memori** | Retrieval, kategori, kelola memori, hero visual neural core |
| **Artifacts** | Dokumen/kode/sheet di panel samping + export PDF/DOCX/XLSX |

## Keamanan

1. **Login PIN (numpad)** — Halaman `/gate`, 4 digit. Sesi bertahan **30 hari** (atur via `VANDOR_GATE_TTL_SECONDS`). Tidak terikat IP — aman saat jaringan/VPN berubah.
2. **Satu perangkat** — Login PIN di perangkat baru otomatis logout perangkat lama (~20 detik). Cookie perangkat + sesi DB; akhiri sesi manual dari **Pengaturan → Riwayat login**.
3. **Owner tunggal** — `VANDOR_OWNER_EMAIL` / `PASSWORD`; register dinonaktifkan.
4. **Rate limit** — 3x PIN salah → blokir perangkat 1 jam.

Akses utama lewat **PIN gate** (bukan IP allowlist).

## Tools AI (hanya yang real)

Semua tool di bawah ini punya implementasi server (`lib/ai/tools/`):

- `getCurrentTime`, `getLocation`, `getWeather`, `showMap`
- `webSearch` (Tavily / DuckDuckGo + Wikipedia)
- `saveMemory`, `getMemory`, `searchDb`, `manageNotes`, `updateTask`
- **Vercel production:** set `BLOB_READ_WRITE_TOKEN` (or Cloudflare `R2_*`) for PDF/DOCX/uploads
- **Web search:** `TAVILY_API_KEY` recommended for live scores & news (Settings → API also works)
- Slash skills: `/catat`, `/catatan`, `/baca`, `/todo`, `/ingat`, `/cari`, `/cuaca`, …
- `createDocument`, `editDocument`, `updateDocument`, `requestSuggestions`
- `createPdf`, `createDocx`, `createSpreadsheet`, `generateImage`

Model **tidak boleh** mengarang nama tool lain (daftar di `lib/ai/tools/registry.ts`).

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
```

**Tetap wajib di `.env`:** `AUTH_SECRET`, `POSTGRES_URL`, owner, PIN (atau PIN dari UI DB).

**Bisa dari UI:** OpenRouter key, Tavily, gaya bicara, model embedding, PIN baru (terenkripsi).

### Install & jalankan

```powershell
cd "C:\Users\User\Documents\VANDOR V1"
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
5. Tes: `/gate` → PIN → chat → **Pengaturan** / **Pengaturan Memori**.

| Variabel | Wajib di Vercel |
|----------|-----------------|
| `AUTH_SECRET` | Ya |
| `POSTGRES_URL` | Ya (juga untuk migrasi saat build) |
| `VANDOR_OWNER_EMAIL` / `PASSWORD` | Ya |
| `VANDOR_NUMPAD_PIN` | Ya (fallback; bisa ganti di UI) |
| `NEXT_PUBLIC_APP_URL` | Ya |
| `OPENROUTER_API_KEY` | Opsional (UI) |
Opsional file upload production: `BLOB_READ_WRITE_TOKEN` (Vercel Blob) — tanpa ini export file pakai `public/storage` lokal.

### Unduh media (`/tt`, `/ytv`, `/yts`, `/ig`)

| Yang perlu | Lokal (dev) | Vercel (production) |
|------------|-------------|---------------------|
| **Link file untuk user** | Opsional (`public/storage`) | **Wajib** `BLOB_READ_WRITE_TOKEN` atau `R2_*` |
| **Engine unduh** | Pasang **yt-dlp** (`winget install yt-dlp`) | **Cobalt** `COBALT_API_URL` (+ `COBALT_API_KEY` jika perlu) |
| OpenRouter | Tidak dipakai untuk slash unduh | Sama |

Contoh slash: `/ytv https://www.youtube.com/watch?v=...`

## VANDOR v4 (speed & token efficiency)

- **Command-first**: `/cuaca`, `/waktu`, `/catatan`, `/todo …`, `/cari`, `/tt` → jalankan tool/code langsung (**0 token** LLM utama).
- **Dynamic tool loading**: maks. ~5 tool aktif per request (bukan semua 20+).
- **Memory cap**: top 5 memori, ~3k karakter context.
- **Chat trim**: 10 pesan terakhir + conversation summary (bukan full history).
- **Instant status**: UI "Sedang …" <300ms sebelum stream LLM.
- **Agent loop**: maks. 4 step tool (hard cap).

Modul: `lib/v4/` (`intent`, `tool-router`, `commands`, `fast-stream`, `model-pick`, `overhead`, cache cuaca).

**Hemat token tambahan:** skip polish & pre-extract untuk chat simpel; model cepat untuk intent ringan; output cap 512 token (simple) / 2048 (enhanced); cuaca di-cache 15 menit.

## Struktur penting

```
app/
  gate/              # PIN numpad
  denied/            # IP tidak diizinkan
  (chat)/            # Chat + settings
lib/
  security/          # Gate, IP allowlist, client-access
  memory/            # pgvector, extract, visual
  ai/tools/          # Tool implementations
  settings/          # Persona + secrets (encrypted)
proxy.ts             # IP + gate pada setiap request
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
| PIN lagi setelah ganti jaringan | Normal — gate terikat IP; masukkan PIN |
| `Login owner gagal` | Cek `VANDOR_OWNER_EMAIL` / `PASSWORD` |
| Build gagal migrasi | Set `POSTGRES_URL` di Vercel sebelum build |
| Memory tidak jalan | Migrasi + extension `vector` di Neon |
| OpenRouter 402 | Tambah kredit atau pilih model `:free` |

## Lisensi

Berdasarkan template Chatbot (AI SDK). VANDOR — modifikasi pribadi.
