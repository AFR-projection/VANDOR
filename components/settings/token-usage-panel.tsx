"use client";

import { GaugeIcon } from "lucide-react";

export function TokenUsagePanel() {
  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2">
        <GaugeIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Estimasi token (v4)</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Setiap balasan assistant menampilkan chip abu-abu di bawah pesan:
        perkiraan token masuk (memori + riwayat + web + file) dan batas keluar.
        Ini estimasi internal (~4 karakter = 1 token), bukan tagihan resmi
        OpenRouter.
      </p>
      <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
        <li>Memori: maks ~5 fakta / ~3200 karakter per giliran</li>
        <li>
          Riwayat chat: 10 pesan terakhir (+ ringkasan di pengaturan lanjutan)
        </li>
        <li>
          Web search: konteks sumber di-inject, kartu di UI (tidak diulang di
          teks)
        </li>
        <li>
          Mode simple: batas keluar ~512 token; enhanced ~2048; web ~config
          sintesis
        </li>
      </ul>
    </section>
  );
}
