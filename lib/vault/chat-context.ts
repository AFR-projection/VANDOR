import type { VaultOpenNotice } from "./notice";

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

/** Latest vault file opened in this chat (for AI vision on follow-up messages). */
export function getActiveVaultOpen(
  messages: MessageLike[]
): VaultOpenNotice | null {
  let active: VaultOpenNotice | null = null;
  for (const msg of messages) {
    if (msg.role === "user") {
      const text = userText(msg);
      if (/^\/?v\s+open\s+/i.test(text)) {
        active = null;
      }
    }
    if (msg.role === "assistant") {
      for (const part of msg.parts) {
        if (part.type === "data-vault-open" && part.data) {
          active = part.data as VaultOpenNotice;
        }
      }
    }
  }
  return active;
}
