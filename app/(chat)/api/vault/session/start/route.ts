/**
 * Vault Session Start Endpoint
 *
 * Creates a NEW chat row tagged with mode="vault" — fully isolated from
 * any existing chat history, memory, or AI context. Returns the new chat
 * ID for the client to navigate to.
 *
 * This is the ONLY way to enter Vault Mode. The vault session is its own
 * chat record with no link to previous chats.
 */

import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { startVaultSession } from "@/lib/vault/session";

export async function POST(_request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const result = await startVaultSession(session.user.id);
  return Response.json(result);
}
