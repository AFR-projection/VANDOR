import "server-only";

import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { resolveVaultUserId } from "./vault-scope";

export type VaultSession = {
  sessionUserId: string;
  vaultUserId: string;
};

export async function requireVaultSession(): Promise<
  VaultSession | ChatbotError
> {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat");
  }

  const vaultUserId = await resolveVaultUserId(session.user.id);
  return {
    sessionUserId: session.user.id,
    vaultUserId,
  };
}
