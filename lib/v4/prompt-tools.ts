import type { VandorChatToolName } from "@/lib/ai/tools/registry";
import { MEDIA_SLASH_HINT } from "@/lib/chat/media-slash";

const TOOL_BLURBS: Partial<Record<VandorChatToolName, string>> = {
  getCurrentTime: "waktu/tanggal",
  getLocation: "lokasi IP",
  getWeather: "cuaca",
  showMap: "peta",
  webSearch: "data live (jika belum di konteks)",
  saveMemory: "simpan memori",
  getMemory: "ambil memori",
  searchDb: "cari memori/tasks (TIDAK termasuk Vault)",
  updateTask: "task/todo",
  createDocument: "artifact teks/kode/sheet",
  editDocument: "edit artifact",
  updateDocument: "rewrite artifact",
  requestSuggestions: "saran edit dokumen",
  createPdf: "export PDF",
  createDocx: "export DOCX",
  createSpreadsheet: "export XLSX",
  generateImage: "gambar baru",
  editImage: "edit foto upload",
  generateVideo: "video dari prompt",
  generateVoice: "TTS",
  transcribeAudio: "transkripsi audio",
  createWhatsappSticker: "stiker WhatsApp",
  downloadMedia: "unduh TT/IG",
};

const VAULT_ISOLATION_HINT = `
## Vault (terisolasi dari AI)
- Kamu **TIDAK** punya akses ke Vault. Tidak ada tool \`manageVault\`, \`searchDb\` juga tidak return file Vault.
- Jika user bertanya tentang isi Vault, jelaskan: gunakan \`/v\` untuk masuk Vault Mode (AI OFF, mode terisolasi), atau \`/share-to-ai <id>\` bila ingin AI membaca file tertentu dengan sadar.
- Jangan mengarang nama file, isi, atau metadata Vault. Vault privat user.
`.trim();

export function buildActiveToolsPrompt(
  activeTools: VandorChatToolName[]
): string {
  if (activeTools.length === 0) {
    return `## Tools (VANDOR v4)
No tools enabled for this turn — answer from context only. Do not invent tool names.

${VAULT_ISOLATION_HINT}`;
  }

  const lines = activeTools.map(
    (t) => `- \`${t}\` — ${TOOL_BLURBS[t] ?? "see server"}`
  );

  const extras: string[] = [
    `## Tools aktif (VANDOR v4 — hanya ${activeTools.length} tool ini)
Jangan panggil tool di luar daftar. UI menampilkan kartu/map/sumber — jangan ulang data panjang di chat.`,
    ...lines,
    "- Memori/task: jangan webSearch.",
    "- Web search sudah di konteks → jangan panggil webSearch lagi.",
    ...(activeTools.includes("webSearch")
      ? [
          "- Minta link/tautan/URL/playlist: WAJIB webSearch atau pakai konteks WEB SEARCH — jangan bilang tidak bisa akses internet.",
        ]
      : []),
    VAULT_ISOLATION_HINT,
  ];

  if (activeTools.includes("downloadMedia")) {
    extras.push(MEDIA_SLASH_HINT);
  }

  return extras.join("\n");
}
