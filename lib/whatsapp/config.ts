import "server-only";

import { createHash } from "node:crypto";

import { getIntegrationRuntimeConfig } from "@/lib/settings/integration-runtime";
import { getUserSettings } from "@/lib/settings/queries";
import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";

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

async function ownerNumbersRaw(): Promise<string> {
  const owner = await resolveDeploymentOwnerUser();
  if (owner) {
    const settings = await getUserSettings(owner.id);
    const fromUi = settings.integrations.whatsappOwnerNumbers.trim();
    if (fromUi) {
      return fromUi;
    }
  }
  return process.env.WHATSAPP_OWNER_NUMBERS ?? "";
}

/** Allowed owner numbers (comma separated), normalized to digits. */
export async function getOwnerWhatsappNumbers(): Promise<string[]> {
  const raw = await ownerNumbersRaw();
  return raw
    .split(",")
    .map((n) => normalizeWhatsappNumber(n))
    .filter((n) => n.length >= 6);
}

export async function isOwnerWhatsappNumber(input: string): Promise<boolean> {
  const normalized = normalizeWhatsappNumber(input);
  if (!normalized) {
    return false;
  }
  const owners = await getOwnerWhatsappNumbers();
  if (owners.length === 0) {
    return true;
  }
  return owners.some(
    (owner) => owner === normalized || normalized.endsWith(owner)
  );
}

export async function getBridgeSecret(): Promise<string | null> {
  const cfg = await getIntegrationRuntimeConfig();
  const secret = cfg.whatsappBridge.secret;
  return secret && secret.length >= 8 ? secret : null;
}

/** Concrete model used for WhatsApp turns (overridable, defaults to free tools-capable). */
export async function getWhatsappModelId(): Promise<string> {
  const owner = await resolveDeploymentOwnerUser();
  if (owner) {
    const settings = await getUserSettings(owner.id);
    const fromUi = settings.integrations.whatsappModel.trim();
    if (fromUi) {
      return fromUi;
    }
  }
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
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
