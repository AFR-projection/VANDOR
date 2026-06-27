"use client";

import { CircleHelpIcon } from "lucide-react";

const sections = [
  {
    title: "Slash skills di chat",
    items: [
      "/v — masuk Vault Mode (list, upload, read di dalam mode)",
      "/share-to-ai <id> — bagikan satu file berangkas ke AI (consent)",
      "/cari — pencarian web",
      "/cuaca · /waktu — info lokal",
      "/ingat — simpan ke memori jangka panjang",
      "/tt <link> — unduh video TikTok",
      "/ig <link> — unduh video Instagram",
    ],
  },
  {
    title: "Unduh media (TikTok / IG)",
    items: [
      "VPS: yt-dlp otomatis (bash deploy/hostinger/install-ytdlp.sh)",
      "WhatsApp: /tt kirim video langsung ke chat",
      "Web: link unduh via R2 setelah login",
      "YouTube tidak didukung (IP server diblokir Google)",
    ],
  },
  {
    title: "Data terkini (skor, harga, berita)",
    items: [
      "Aktifkan Web search otomatis di Pengaturan → Memori",
      "Isi Tavily API di tab API (gratis ~1000/bulan)",
      "Tier Seimbang/Premium + orchestrator → Research Agent",
    ],
  },
  {
    title: "File & PDF di Vercel",
    items: [
      "Wajib: BLOB_READ_WRITE_TOKEN (Vercel Blob, akses Public)",
      "Opsional: Cloudflare R2 (R2_* env) sebagai alternatif",
      "Tanpa storage cloud, PDF/upload gagal di production",
    ],
  },
  {
    title: "Suara & mobile",
    items: [
      "Tombol mikrofon di kotak chat → transkripsi → kirim teks",
      "Install app: menu browser → Add to Home Screen (PWA)",
    ],
  },
];

export function HelpGuidePanel() {
  return (
    <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2">
        <CircleHelpIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Panduan cepat VANDOR</h2>
      </div>
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="text-xs font-semibold text-foreground">{s.title}</h3>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-muted-foreground">
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
