/**
 * Slash skills (/todo, /ingat, …) — prompt templates & one-shot actions for VANDOR chat.
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
    sendText: "/cuaca",
  },
  {
    name: "waktu",
    description: "Jam & tanggal sekarang",
    kind: "send",
    sendText: "/waktu",
  },
  {
    name: "ringkas",
    description: "Ringkas percakapan chat ini",
    kind: "send",
    sendText: "/ringkas",
  },
  {
    name: "agent",
    description: "Status VANDOR Operator (CPU, approval, goals)",
    kind: "send",
    sendText: "/agent",
  },
  {
    name: "tt",
    description: "Unduh video TikTok (MP4)",
    kind: "insert",
    insertText: "/tt ",
  },
  {
    name: "ig",
    description: "Unduh video Instagram (MP4)",
    kind: "insert",
    insertText: "/ig ",
  },
];
