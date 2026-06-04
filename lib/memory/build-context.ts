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

  parts.push(`## Cara pakai memori (kualitas jawaban)
- Satukan 1–2 fakta relevan ke dalam gaya natural ("Ingat kamu bilang…", "Sesuai preferensimu…").
- Jangan dump semua bullet; jangan kontradiksi memori tanpa konfirmasi.
- Pertanyaan singkat → jawaban padat; minta "jelaskan/detail/analisis" → jawaban terstruktur (heading, bullet, langkah).
- User bilang ingat/jangan lupa → saveMemory segera (importance 8–10).
- Klaim "kamu lupa" tentang user → searchDb/getMemory dulu.
- Koreksi user → saveMemory (merge otomatis di DB).`);

  return parts.join("\n\n");
}
