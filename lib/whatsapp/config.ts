import { createHash } from "node:crypto";

/**
 * WhatsApp bridge configuration helpers.
 *
 * The bridge (Baileys) runs on an always-on host and forwards owner messages to
 * VANDOR. We only ever act on whitelisted owner numbers and require a shared
 * bearer secret so the public ingest endpoint can't be abused.
 */

/** Strip everything except digits — "+62 812-3456 7890" -> "6281234567890". */
export function normalizeWhatsappNumber(input: string): string {
  return (input || "").replace(/\D/g, "");
}

/** Allowed owner numbers (comma separated in env), normalized to digits. */
export function getOwnerWhatsappNumbers(): string[] {
  const raw = process.env.WHATSAPP_OWNER_NUMBERS ?? "";
  return raw
    .split(",")
    .map((n) => normalizeWhatsappNumber(n))
    .filter((n) => n.length >= 6);
}

export function isOwnerWhatsappNumber(input: string): boolean {
  const normalized = normalizeWhatsappNumber(input);
  if (!normalized) {
    return false;
  }
  const owners = getOwnerWhatsappNumbers();
  // No whitelist configured → reply to every 1:1 chat (personal-bot mode).
  if (owners.length === 0) {
    return true;
  }
  return owners.some(
    (owner) => owner === normalized || normalized.endsWith(owner)
  );
}

export function getBridgeSecret(): string | null {
  const secret = process.env.WHATSAPP_BRIDGE_SECRET?.trim();
  return secret && secret.length >= 8 ? secret : null;
}

/** Concrete model used for WhatsApp turns (overridable, defaults to free tools-capable). */
export function getWhatsappModelId(): string {
  return (
    process.env.WHATSAPP_MODEL?.trim() ||
    "meta-llama/llama-3.3-70b-instruct:free"
  );
}

/**
 * Derive a STABLE chat UUID from a WhatsApp number so every message from the
 * same person lands in one ongoing conversation (and shows up in the web UI).
 */
export function deriveWhatsappChatId(number: string): string {
  const normalized = normalizeWhatsappNumber(number);
  const hash = createHash("sha256")
    .update(`vandor-whatsapp:${normalized}`)
    .digest("hex");
  // Format the first 32 hex chars as a v4-shaped UUID (deterministic).
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
