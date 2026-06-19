/**
 * Vault Mode — per-chat isolated workspace.
 *
 * State derivation: walk messages, find the LAST vault-mode lifecycle event.
 * - `data-vault-mode-enter` → mode ON
 * - `data-vault-mode-exit`  → mode OFF
 *
 * Both client and server use this same derivation, so no DB column needed.
 * Per-chat isolation: each chat has its own message history → its own mode.
 */

const ENTER_TYPE = "data-vault-mode-enter";
const EXIT_TYPE = "data-vault-mode-exit";

export type VaultModeNotice = {
  enteredAt: string;
};

export type VaultModeExitNotice = {
  exitedAt: string;
  reason?: "user" | "share-to-ai";
};

type MessageLike = {
  role: string;
  parts: Array<{ type: string; data?: unknown }>;
};

export function isVaultModeActive(messages: MessageLike[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part.type === EXIT_TYPE) return false;
      if (part.type === ENTER_TYPE) return true;
    }
  }
  return false;
}

export function vaultModeEnterDataPart(data: VaultModeNotice): {
  type: typeof ENTER_TYPE;
  data: VaultModeNotice;
} {
  return { type: ENTER_TYPE, data };
}

export function vaultModeExitDataPart(data: VaultModeExitNotice): {
  type: typeof EXIT_TYPE;
  data: VaultModeExitNotice;
} {
  return { type: EXIT_TYPE, data };
}

export const VAULT_MODE_ENTER_TYPE = ENTER_TYPE;
export const VAULT_MODE_EXIT_TYPE = EXIT_TYPE;
