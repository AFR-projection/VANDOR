# VANDOR WhatsApp Bridge (24/7)

Baileys **tidak bisa** hidup terus di Vercel (serverless — fungsi mati setelah idle, WebSocket putus).

Service ini jalan **selalu nyala** di Railway/VPS/laptop, terhubung ke WhatsApp, lalu meneruskan pesan owner ke VANDOR di Vercel lewat `/api/whatsapp/ingest`.

## Setup (Railway)

1. **New Service** → deploy dari repo ini, **Root Directory:** `services/whatsapp-bridge`
2. **Volume** (disarankan): mount `/app/.whatsapp-auth` supaya sesi WA tidak hilang saat redeploy
3. **Environment variables:**

| Variabel | Contoh | Wajib |
|----------|--------|-------|
| `VANDOR_APP_URL` | `https://vandor-xxx.vercel.app` | Ya |
| `WHATSAPP_BRIDGE_SECRET` | string acak min. 8 karakter | Ya |
| `WHATSAPP_OWNER_NUMBERS` | `6281234567890` | Opsional (kosong = semua chat 1:1) |

4. Di **VANDOR → Pengaturan → API & integrasi**: isi **WhatsApp bridge secret** dengan **nilai persis sama** + PIN → Simpan
5. Deploy → buka **Logs** → scan QR (Perangkat tertaut di HP)

## Bridge secret — isi apa?

Bebas, asal:

- **Min. 8 karakter**
- **Sama persis** di Railway (`WHATSAPP_BRIDGE_SECRET`) dan di UI VANDOR
- **Acak & kuat** (jangan `password123`)

Contoh generate:

```powershell
# PowerShell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Atau: `openssl rand -hex 16`

Ini bukan API key pihak ketiga — hanya **kata sandi bersama** supaya endpoint ingest di Vercel tidak bisa diserang orang lain.

## Arsitektur

```
HP (WhatsApp) ↔ Bridge (Railway, always-on) ↔ VercOR (Vercel) ↔ AI agent
                      Bearer secret
```

- **Vercel:** AI, database, UI, ingest API
- **Railway bridge:** satu proses Node + Baileys yang tidak pernah sleep

## Lokal (dev)

```powershell
cd services/whatsapp-bridge
npm install
$env:VANDOR_APP_URL="http://localhost:3000"
$env:WHATSAPP_BRIDGE_SECRET="dev-secret-min8ch"
$env:WHATSAPP_OWNER_NUMBERS="6281234567890"
npm start
```

Scan QR di terminal.

## Troubleshooting

| Gejala | Solusi |
|--------|--------|
| `Bridge secret tidak valid` | Secret Railway ≠ UI VANDOR |
| `503 WHATSAPP_BRIDGE_SECRET belum dikonfigurasi` | Simpan secret di UI dengan PIN |
| QR muncul terus | Hapus volume auth, scan ulang |
| Bot diam | Cek owner number di UI / env bridge |
