import "server-only";

import { getUserSettings } from "@/lib/settings/queries";
import { getChatSummary } from "./assistant-db";
import { buildMemoryContext as buildCore } from "./context";

export async function buildMemoryContext({
  userId,
  query,
  chatId,
}: {
  userId: string;
  query: string;
  chatId?: string;
}): Promise<string> {
  const settings = await getUserSettings(userId);
  const includeVisual = settings.visualMemory.includeInRecall;

  const [core, summaryRow] = await Promise.all([
    buildCore({
      userId,
      query,
      memorySettings: settings.memory,
      includeVisual,
    }),
    chatId && settings.advanced.conversationSummary
      ? getChatSummary(chatId)
      : Promise.resolve(null),
  ]);
  const summary = summaryRow?.summary ?? null;

  const parts: string[] = [];

  if (summary) {
    parts.push(`## Conversation summary (earlier context)
${summary}`);
  }

  if (core) {
    parts.push(core);
  }

  if (parts.length === 0) {
    return "";
  }

  parts.push(`## Cara pakai memori (kualitas jawaban — wajib)
- Weave 1–3 fakta paling relevan secara natural; jangan list semua memori.
- Preferensi & orang → sebut halus ("Kalau tidak salah kamu suka…", "Buat project X kamu…").
- Jangan kontradiksi memori; jika ragu → searchDb/getMemory dulu.
- User bilang ingat/jangan lupa/koreksi → saveMemory (importance 8–10, merge otomatis).
- Jawaban singkat tetap personal; jawaban panjang tetap pakai memori di paragraf awal.`);

  return parts.join("\n\n");
}
