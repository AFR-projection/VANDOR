import type { VandorChatToolName } from "@/lib/ai/tools/registry";
import { NOTES_SKILL_SYSTEM_HINT } from "@/lib/chat/slash-skills";
import { MEDIA_SLASH_HINT } from "@/lib/chat/media-slash";

const TOOL_BLURBS: Partial<Record<VandorChatToolName, string>> = {
  getCurrentTime: "waktu/tanggal",
  getLocation: "lokasi IP",
  getWeather: "cuaca",
  showMap: "peta",
  webSearch: "data live (jika belum di konteks)",
  saveMemory: "simpan memori",
  getMemory: "ambil memori",
  searchDb: "cari memori/notes/tasks",
  manageNotes: "catatan pribadi",
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
  downloadMedia: "unduh TT/YT/IG",
};

export function buildActiveToolsPrompt(activeTools: VandorChatToolName[]): string {
  if (activeTools.length === 0) {
    return `## Tools (VANDOR v4)
No tools enabled for this turn — answer from context only. Do not invent tool names.`;
  }

  const lines = activeTools.map(
    (t) => `- \`${t}\` — ${TOOL_BLURBS[t] ?? "see server"}`
  );

  const extras: string[] = [
    `## Tools aktif (VANDOR v4 — hanya ${activeTools.length} tool ini)
Jangan panggil tool di luar daftar. UI menampilkan kartu/map/sumber — jangan ulang data panjang di chat.`,
    ...lines,
    "- Catatan/memori/task: jangan webSearch.",
    "- Web search sudah di konteks → jangan panggil webSearch lagi.",
  ];

  if (activeTools.includes("manageNotes")) {
    extras.push(NOTES_SKILL_SYSTEM_HINT);
  }
  if (activeTools.includes("downloadMedia")) {
    extras.push(MEDIA_SLASH_HINT);
  }

  return extras.join("\n");
}
