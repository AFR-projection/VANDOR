import "server-only";

import { generateText } from "ai";
import type { OpenRouterClientMeta } from "@/lib/ai/providers";
import { getTitleModel } from "@/lib/ai/providers";
import { titlePrompt } from "@/lib/ai/prompts";
import { fallbackTitleFromUserText } from "@/lib/chat/title-utils";
import {
  getChatById,
  getMessagesByChatId,
  updateChatTitleById,
} from "@/lib/db/queries";
import { convertToUIMessages, getTextFromMessage } from "@/lib/utils";

export { fallbackTitleFromUserText } from "@/lib/chat/title-utils";

export async function generateChatTitleFromUserText(
  userText: string,
  apiKey?: string,
  meta?: OpenRouterClientMeta
): Promise<string> {
  const trimmed = userText.trim();
  if (!trimmed) {
    return fallbackTitleFromUserText("");
  }

  try {
    const { text } = await generateText({
      model: getTitleModel(apiKey, meta),
      system: titlePrompt,
      prompt: trimmed.slice(0, 2000),
    });
    const cleaned = text
      .replace(/^[#*"\s]+/, "")
      .replace(/["]+$/, "")
      .trim();
    return cleaned || fallbackTitleFromUserText(trimmed);
  } catch {
    return fallbackTitleFromUserText(trimmed);
  }
}

export async function applyChatTitle(input: {
  chatId: string;
  titlePromise: Promise<string> | null | undefined;
  fallbackText: string;
  writeTitle?: (title: string) => void;
}): Promise<string | null> {
  if (!input.titlePromise) {
    return null;
  }

  let title: string;
  try {
    title = (await input.titlePromise).trim();
  } catch {
    title = "";
  }

  if (!title) {
    title = fallbackTitleFromUserText(input.fallbackText);
  }

  input.writeTitle?.(title);
  await updateChatTitleById({ chatId: input.chatId, title });
  return title;
}

export async function setChatTitleFallback(input: {
  chatId: string;
  userText: string;
  writeTitle?: (title: string) => void;
}): Promise<string> {
  const title = fallbackTitleFromUserText(input.userText);
  input.writeTitle?.(title);
  await updateChatTitleById({ chatId: input.chatId, title });
  return title;
}

/** Perbaiki chat lama yang masih berjudul placeholder dari pesan user pertama. */
export async function repairChatTitleIfUntitled(
  chatId: string
): Promise<string | null> {
  const chatRow = await getChatById({ id: chatId });
  if (!chatRow || chatRow.title !== "New chat") {
    return null;
  }

  const messages = await getMessagesByChatId({ id: chatId });
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) {
    return null;
  }

  const ui = convertToUIMessages([firstUser])[0];
  if (!ui) {
    return null;
  }

  const text = getTextFromMessage(ui);
  if (!text.trim()) {
    return null;
  }

  const title = fallbackTitleFromUserText(text);
  await updateChatTitleById({ chatId, title });
  return title;
}

export async function repairUntitledChatsInList<
  T extends { id: string; title: string },
>(chats: T[]): Promise<T[]> {
  const out: T[] = [];
  for (const item of chats) {
    if (item.title !== "New chat") {
      out.push(item);
      continue;
    }
    const repaired = await repairChatTitleIfUntitled(item.id);
    out.push(repaired ? { ...item, title: repaired } : item);
  }
  return out;
}
