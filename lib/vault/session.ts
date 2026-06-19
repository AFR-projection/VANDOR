import "server-only";

import { saveChat, saveMessages } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { vaultModeEnterDataPart } from "./mode";

/**
 * Create a brand-new isolated Vault Session.
 *
 * Architecture:
 * - New Chat row with `mode: "vault"` in DB
 * - Seed assistant message with `data-vault-mode-enter` part
 * - Returns chat ID for client to navigate to
 *
 * The vault session has ZERO connection to any prior chat. Memory,
 * embedding, retrieval, and LLM are all hard-disabled for vault chats
 * via the chat API route.
 */
export async function startVaultSession(userId: string): Promise<{
  chatId: string;
  enteredAt: string;
  redirectTo: string;
}> {
  const chatId = generateUUID();
  const now = new Date();
  const enteredAt = now.toISOString();

  await saveChat({
    id: chatId,
    userId,
    title: `🔒 Vault Session · ${now.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    visibility: "private",
    mode: "vault",
  });

  const entryPart = vaultModeEnterDataPart({ enteredAt });
  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [entryPart] as unknown as object[],
        attachments: [] as unknown as object[],
        createdAt: now,
      },
    ],
  });

  return {
    chatId,
    enteredAt,
    redirectTo: `/chat/${chatId}`,
  };
}
