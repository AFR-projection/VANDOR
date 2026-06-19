import type { ShareToAiNotice, VaultOpenNotice } from "./notice";

type MessageLike = {
  role: string;
  parts: Array<{ type: string; text?: string; data?: unknown }>;
};

function userText(message: MessageLike): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
}

/**
 * Latest vault file explicitly shared to AI via `/share-to-ai <id>`.
 *
 * Vault Mode commands (read/list/add/etc.) NEVER expose files to AI.
 * Only when user runs `/share-to-ai` (with warning UI) does the file
 * become available as an attachment for the next turn.
 *
 * Returns the most recent share-to-ai event in this chat that has not
 * been invalidated by a fresh user message asking for a different file.
 */
export function getActiveVaultOpen(
  messages: MessageLike[]
): VaultOpenNotice | null {
  let active: VaultOpenNotice | null = null;
  for (const msg of messages) {
    if (msg.role === "user") {
      const text = userText(msg);
      // New share-to-ai or open command resets the active file (will be
      // set again by the matching assistant message below).
      if (/^\/?(?:share-to-ai|ai-read|share2ai|v\s+open)\s+/i.test(text)) {
        active = null;
      }
    }
    if (msg.role === "assistant") {
      for (const part of msg.parts) {
        if (part.type === "data-share-to-ai" && part.data) {
          const shared = part.data as ShareToAiNotice;
          active = {
            file: shared.file,
            openUrl: shared.openUrl,
            downloadUrl: shared.downloadUrl,
          };
        } else if (part.type === "data-vault-open" && part.data) {
          active = part.data as VaultOpenNotice;
        }
      }
    }
  }
  return active;
}
