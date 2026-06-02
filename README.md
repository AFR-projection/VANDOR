# VANDOR v3.1 — Personal AI Assistant

VANDOR adalah asisten pribadi (gaya Jarvis) berbasis **Next.js 16**, **OpenRouter**, **Neon Postgres** + **pgvector**, dan **AI SDK**. Satu pemilik, gate PIN, allowlist IP, memori jangka panjang, dan pengaturan dari UI.

## Fitur utama

| Fitur | Deskripsi |
|-------|-----------|
| **Chat multi-model** | OpenRouter — model gratis (`:free`) hingga flagship, pilih di UI |
| **Keamanan berlapis** | Allowlist IP (realtime) + gate PIN 4 digit terikat IP + sesi owner tunggal |
| **Memory v1** | Embedding + pgvector, ekstraksi otomatis, visual memory |
| **Rich answers** | Web search (Tavily / fallback), kartu sumber, galeri, peta |
| **Pengaturan UI** | Gaya bicara AI, API keys terenkripsi, PIN, model embedding — tanpa edit `.env` untuk API |
| **Pengaturan Memori** | Retrieval, kategori, kelola memori, hero visual neural core |
| **Artifacts** | Dokumen/kode/sheet di panel samping + export PDF/DOCX/XLSX |

## Keamanan (realtime)

Setiap request (halaman + API) menjalankan:

1. **IP allowlist** — `VANDOR_ALLOWED_IPS` (kosong = semua IP). Jika IP tidak diizinkan → `/denied`.
2. **Gate PIN** — Cookie gate terikat **IP saat login**. IP berubah (VPN, jaringan lain) → cookie dihapus → **PIN lagi** di `/gate`.
3. **Watchdog client** — Tab chat mem-poll `/api/gate/status` setiap ~8 detik + saat tab fokus; redirect otomatis jika IP/gate tidak valid.
4. **Owner tunggal** — `VANDOR_OWNER_EMAIL` / `PASSWORD`; register dinonaktifkan.

## Tools AI (hanya yang real)

Semua tool di bawah ini punya implementasi server (`lib/ai/tools/`):

- `getCurrentTime`, `getLocation`, `getWeather`, `showMap`
- `webSearch` (Tavily / DuckDuckGo + Wikipedia)
- `saveMemory`, `getMemory`, `searchDb`, `createNote`, `updateTask`
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
VANDOR_ALLOWED_IPS=localhost         # atau IP publik kamu; kosong = allow all
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
VANDOR_ALLOWED_IPS=203.0.113.42    # IP publik kamu (cek /api/whoami)
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
| `VANDOR_ALLOWED_IPS` | Sangat disarankan |

Opsional file upload production: `BLOB_READ_WRITE_TOKEN` (Vercel Blob) — tanpa ini export file pakai `public/storage` lokal.

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
| Redirect `/denied` | Tambah IP ke `VANDOR_ALLOWED_IPS` atau kosongkan untuk allow-all |
| PIN lagi setelah ganti jaringan | Normal — gate terikat IP; masukkan PIN |
| `Login owner gagal` | Cek `VANDOR_OWNER_EMAIL` / `PASSWORD` |
| Build gagal migrasi | Set `POSTGRES_URL` di Vercel sebelum build |
| Memory tidak jalan | Migrasi + extension `vector` di Neon |
| OpenRouter 402 | Tambah kredit atau pilih model `:free` |

## Lisensi

Berdasarkan template Chatbot (AI SDK). VANDOR — modifikasi pribadi.
