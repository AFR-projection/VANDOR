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

  parts.push(`## Memory usage
- Weave memory naturally — e.g. "Kalau tidak salah kamu pernah bilang…" when relevant.
- Do not dump all memories at once.
- On "ingat", "jangan lupa", "remember this" → call saveMemory immediately (importance 8–10).
- Similar facts are merged automatically; prefer updating via saveMemory when the user corrects something.`);

  return parts.join("\n\n");
}
