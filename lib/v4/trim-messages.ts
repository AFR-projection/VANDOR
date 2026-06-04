import type { ChatMessage } from "@/lib/types";
import { V4_MAX_CHAT_MESSAGES } from "@/lib/v4/constants";

/**
 * Keep only recent turns for the model — summary lives in system prompt.
 */
export function trimUiMessagesForModel(
  messages: ChatMessage[],
  maxMessages = V4_MAX_CHAT_MESSAGES
): ChatMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }
  return messages.slice(-maxMessages);
}
