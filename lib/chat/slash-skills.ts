/**
 * Slash skills (/catat, /todo, …) — prompt templates & one-shot actions for VANDOR chat.
 */

export type SlashSkillKind = "ui" | "insert" | "send";

export type SlashSkillDef = {
  name: string;
  description: string;
  kind: SlashSkillKind;
  /** UI action for built-in commands (new, clear, …) */
  action?: string;
  /** Prefill composer — user edits then sends */
  insertText?: string;
  /** Send immediately (no extra click) */
  sendText?: string;
};

export const SLASH_SKILLS: SlashSkillDef[] = [
  {
    name: "catat",
    description: "Simpan catatan (judul + isi) ke database pribadi",
    kind: "insert",
    insertText: `Judul: 

Isi:

(Simpan sebagai catatan pribadi — setelah kamu isi judul & isi di atas, kirim pesan ini.)`,
  },
  {
    name: "catatan",
    description: "Lihat daftar judul catatan kamu",
    kind: "send",
    sendText:
      "Tampilkan semua catatan pribadi saya. Gunakan manageNotes action list — tampilkan hanya nomor urut + judul (jangan tampilkan isi penuh dulu). Kalau belum ada catatan, bilang jelas.",
  },
  {
    name: "baca",
    description: "Buka satu catatan berdasarkan judul",
    kind: "insert",
    insertText:
      "Buka catatan dengan judul: \n\n(Tulis judul persis atau sebagian — VANDOR akan menampilkan judul lengkap + isi penuh.)",
  },
  {
    name: "todo",
    description: "Buat atau lihat daftar tugas",
    kind: "insert",
    insertText: `Buat task baru: 

(Pakai updateTask action create, atau list untuk melihat semua task.)`,
  },
  {
    name: "ingat",
    description: "Simpan fakta ke memori jangka panjang",
    kind: "insert",
    insertText: `Ingat ini untuk selamanya: 

(Pakai saveMemory setelah user mengisi.)`,
  },
  {
    name: "cari",
    description: "Cari di web (berita, fakta terkini)",
    kind: "insert",
    insertText: "Cari di web tentang: ",
  },
  {
    name: "cuaca",
    description: "Cuaca di lokasiku sekarang",
    kind: "send",
    sendText:
      "Cuaca di lokasi saya sekarang (pakai getLocation + getWeather, jawab ringkas dalam Bahasa Indonesia).",
  },
  {
    name: "waktu",
    description: "Jam & tanggal sekarang",
    kind: "send",
    sendText:
      "Jam dan tanggal sekarang untuk timezone saya (getCurrentTime + lokasi kalau perlu).",
  },
  {
    name: "ringkas",
    description: "Ringkas percakapan chat ini",
    kind: "send",
    sendText:
      "Ringkas percakapan kita di chat ini dalam poin-poin singkat (Bahasa Indonesia). Sorot keputusan & action item.",
  },
];

/** Hint for the model when user message matches /catat workflow */
export const NOTES_SKILL_SYSTEM_HINT = `
## Catatan pribadi (/catat, /catatan, /baca)
- Simpan: \`manageNotes\` action \`create\` — wajib judul + isi. User bisa kirim format "Judul:" / "Isi:" atau paragraf bebas (ambil judul baris pertama).
- Daftar: action \`list\` — tampilkan **hanya nomor + judul**. Jangan dump isi penuh kecuali user minta satu judul.
- Buka satu: action \`get\` dengan \`title\` atau \`noteId\` — tampilkan **judul lengkap + isi penuh**.
- Update/hapus: action \`update\` / \`delete\` bila user minta ubah atau hapus catatan.
`.trim();
