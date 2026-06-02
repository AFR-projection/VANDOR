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
- Use saveMemory tool when user shares something worth remembering long-term.`);

  return parts.join("\n\n");
}
