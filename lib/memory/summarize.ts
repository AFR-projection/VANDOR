import "server-only";

import { generateText } from "ai";
import { getTitleModel } from "@/lib/ai/providers";
import { getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages, getTextFromMessage } from "@/lib/utils";
import { getChatSummary, upsertChatSummary } from "./assistant-db";

const SUMMARY_INTERVAL = Number(process.env.VANDOR_SUMMARY_INTERVAL ?? 15);

const SUMMARY_PROMPT = `Summarize this conversation for long-term context. Capture:
- Main topics discussed
- Decisions made
- User goals and preferences mentioned
- Open questions or pending tasks

Write 4-8 bullet points in the user's language (Indonesian or English).
Be concise but preserve names, projects, and key facts.`;

export async function maybeSummarizeChat({
  chatId,
  userId,
  openRouterApiKey,
}: {
  chatId: string;
  userId: string;
  openRouterApiKey?: string;
}): Promise<string | null> {
  const { resolveOpenRouterApiKeyForUser } = await import("@/lib/ai/providers");
  const apiKey =
    openRouterApiKey ?? (await resolveOpenRouterApiKeyForUser(userId));
  if (!apiKey || !process.env.POSTGRES_URL) {
    return null;
  }

  const dbMessages = await getMessagesByChatId({ id: chatId });
  const messageCount = dbMessages.length;

  if (messageCount < SUMMARY_INTERVAL) {
    return (await getChatSummary(chatId))?.summary ?? null;
  }

  const existing = await getChatSummary(chatId);
  const messagesSinceSummary = existing
    ? messageCount - existing.messageCount
    : messageCount;

  if (existing && messagesSinceSummary < SUMMARY_INTERVAL) {
    return existing.summary;
  }

  const uiMessages = convertToUIMessages(dbMessages);
  const transcript = uiMessages
    .slice(-40)
    .map((m) => `${m.role}: ${getTextFromMessage(m).slice(0, 500)}`)
    .join("\n");

  try {
    const { text } = await generateText({
      model: getTitleModel(apiKey),
      system: SUMMARY_PROMPT,
      prompt: transcript.slice(0, 8000),
    });

    const summary = text.trim();
    if (summary.length < 20) {
      return existing?.summary ?? null;
    }

    await upsertChatSummary({ chatId, summary, messageCount });
    return summary;
  } catch {
    return existing?.summary ?? null;
  }
}

export { SUMMARY_INTERVAL };
