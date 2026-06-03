# Changelog

Semua perubahan penting VANDOR didokumentasikan di sini (format terinspirasi [Keep a Changelog](https://keepachangelog.com/)).

## [3.2.0] — 2026-06-04

### Ditambahkan

- **Tier model** — Gratis, Hemat, Seimbang, Premium (ganti input manual OpenRouter per slot).
- **Rotasi model gratis** — 15 model `:free` bergantian + probe sebelum stream.
- **Riwayat login** — Panel di Pengaturan → Keamanan (IP, lokasi, perangkat).
- **Satu perangkat aktif** — Login PIN di perangkat baru mencabut sesi lama (~20 detik).
- **Mobile chat** — Layout full viewport, keyboard-safe composer, Pyodide on-demand.
- **Status model** — Strip tier + toast saat fallback di composer.

### Diubah

- Preset tier di `lib/ai/model-tiers.ts` — sumber tunggal slot model.
- Gate: watchdog hanya logout saat `sessionRevoked` (bukan `requiresPin` palsu).
- README & keamanan — dokumentasi satu perangkat.

### Diperbaiki

- Logout otomatis setelah PIN benar (“Sesi kedaluwarsa” palsu).
- Cookie gate + perangkat diset konsisten saat verify.
- Validasi sesi DB tidak memblokir token yang belum punya baris.

## [3.1.0]

- Baseline VANDOR: chat OpenRouter, memori pgvector, gate PIN, orchestrator, artifacts, web search.

