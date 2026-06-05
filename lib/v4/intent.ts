import "server-only";

import type { FileKind } from "@/lib/files/mime";
import { detectWebSearchNeed } from "@/lib/search/detect";

export type VandorIntent =
  | "command"
  | "task"
  | "notes"
  | "memory"
  | "weather"
  | "time"
  | "search"
  | "map"
  | "media"
  | "document"
  | "code"
  | "image"
  | "pdf"
  | "chat_simple"
  | "chat_reasoning";

export type ResolvedIntent = {
  intent: VandorIntent;
  needsLargeModel: boolean;
  /** Skip main LLM entirely (handled by code/tools). */
  bypassLlm: boolean;
};

const TASK_RE =
  /\b(todo|task|tugas|to-?do)\b|buat(?:kan)?\s+(?:task|tugas|todo)|tambah(?:kan)?\s+(?:task|tugas)|daftar\s+(?:task|tugas|todo)|list\s+task/i;

const NOTES_RE =
  /\b(catatan|note|memo)\b|\/catat|judul\s*:|\/catatan|\/baca|daftar\s+catatan|list\s+catatan/i;

const MEMORY_RE =
  /\b(ingat|jangan lupa|remember|save\s+memory|simpan\s+ke\s+memori)\b/i;

const WEATHER_RE = /\b(cuaca|weather|panas|hujan|derajat|suhu)\b/i;

const TIME_RE =
  /\b(jam\s+berapa|pukul|what\s+time|tanggal|hari\s+ini\s+jam|waktu\s+sekarang)\b/i;

const MAP_RE =
  /\b(peta|map|dimana|di\s+mana|lokasi|terdekat|near\s+me|alamat)\b/i;

const DOC_RE =
  /\b(artifact|dokumen\s+panel|edit\s+dokumen|update\s+document)\b/i;

const CODE_RE =
  /\b(code|coding|function|bug|typescript|javascript|python|react|refactor|implement)\b/i;

const IMAGE_RE =
  /\b(gambar|generate\s+image|buatkan\s+gambar|edit\s+(?:foto|gambar)|logo|ilustrasi)\b/i;

const PDF_RE = /\b(pdf|docx|xlsx|spreadsheet|excel)\b/i;

export function resolveVandorIntent(input: {
  userText: string;
  attachmentKinds: FileKind[];
  webSearchActive: boolean;
  isSlashCommand?: boolean;
}): ResolvedIntent {
  const text = input.userText.trim();

  if (input.isSlashCommand) {
    return { intent: "command", needsLargeModel: false, bypassLlm: true };
  }

  if (input.attachmentKinds.includes("image")) {
    return { intent: "image", needsLargeModel: true, bypassLlm: false };
  }

  if (input.webSearchActive || detectWebSearchNeed(text).needed) {
    return { intent: "search", needsLargeModel: false, bypassLlm: false };
  }

  if (MAP_RE.test(text)) {
    return { intent: "map", needsLargeModel: false, bypassLlm: false };
  }

  if (WEATHER_RE.test(text)) {
    return { intent: "weather", needsLargeModel: false, bypassLlm: false };
  }

  if (TIME_RE.test(text) && text.length < 120) {
    return { intent: "time", needsLargeModel: false, bypassLlm: false };
  }

  if (TASK_RE.test(text) && text.length < 400) {
    return {
      intent: "task",
      needsLargeModel: false,
      bypassLlm: /^(buat|tambah|catat|add)/i.test(text) && text.length < 200,
    };
  }

  if (NOTES_RE.test(text) && text.length < 500) {
    return {
      intent: "notes",
      needsLargeModel: false,
      bypassLlm: Boolean(text.match(/^judul\s*:/im) || /^\/catat/i.test(text)),
    };
  }

  if (MEMORY_RE.test(text) && text.length < 300) {
    return { intent: "memory", needsLargeModel: false, bypassLlm: true };
  }

  if (PDF_RE.test(text)) {
    return { intent: "pdf", needsLargeModel: false, bypassLlm: false };
  }

  if (IMAGE_RE.test(text)) {
    return { intent: "image", needsLargeModel: true, bypassLlm: false };
  }

  if (DOC_RE.test(text)) {
    return { intent: "document", needsLargeModel: false, bypassLlm: false };
  }

  if (CODE_RE.test(text)) {
    return { intent: "code", needsLargeModel: true, bypassLlm: false };
  }

  if (text.length < 50 && !text.includes("?")) {
    return { intent: "chat_simple", needsLargeModel: false, bypassLlm: false };
  }

  if (
    CODE_RE.test(text) ||
    text.length > 200 ||
    /\b(analisis|strategy|bandingkan|compare|rencana)\b/i.test(text)
  ) {
    return {
      intent: "chat_reasoning",
      needsLargeModel: true,
      bypassLlm: false,
    };
  }

  return { intent: "chat_simple", needsLargeModel: false, bypassLlm: false };
}
