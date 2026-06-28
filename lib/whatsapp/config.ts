import "server-only";

import { createHash } from "node:crypto";

import { getIntegrationRuntimeConfig } from "@/lib/settings/integration-runtime";
import { getUserSettings } from "@/lib/settings/queries";
import { resolveIntegrationModels } from "@/lib/ai/integration-models";
import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";
import {
  isLikelyDialablePhone,
  normalizeWhatsappNumber,
} from "@/lib/whatsapp/phone";

export { normalizeWhatsappNumber } from "@/lib/whatsapp/phone";

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

/** Nomor owner utama untuk alert Operator (UI → env fallback). */
export async function getPrimaryWhatsappOwner(): Promise<string | null> {
  const owner = await resolveDeploymentOwnerUser();
  if (owner) {
    const settings = await getUserSettings(owner.id);
    const fromUi = normalizeWhatsappNumber(
      settings.integrations.whatsappPrimaryOwner
    );
    if (fromUi.length >= 6) {
      return fromUi;
    }
  }
  const fromEnv = normalizeWhatsappNumber(
    process.env.WHATSAPP_PRIMARY_OWNER ?? ""
  );
  return fromEnv.length >= 6 ? fromEnv : null;
}

/** True jika pengirim adalah owner utama (nomor atau LID terkait). */
export async function isPrimaryWhatsappSender(input: {
  phone?: string | null;
  lid?: string | null;
}): Promise<boolean> {
  const primary = await getPrimaryWhatsappOwner();
  if (!primary) {
    return false;
  }
  const keys = new Set<string>();
  if (input.phone) {
    keys.add(normalizeWhatsappNumber(input.phone));
  }
  if (input.lid) {
    keys.add(normalizeWhatsappNumber(input.lid));
  }
  for (const k of keys) {
    if (!k) {
      continue;
    }
    if (k === primary || k.endsWith(primary) || primary.endsWith(k)) {
      return true;
    }
  }
  return false;
}

/** Allowed owner numbers (comma separated), normalized to digits. */
export async function getOwnerWhatsappNumbers(): Promise<string[]> {
  const raw = await ownerNumbersRaw();
  return raw
    .split(",")
    .map((n) => normalizeWhatsappNumber(n))
    .filter((n) => isLikelyDialablePhone(n));
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

/** Model WhatsApp — UI override → tier chat → env → Grok (Seimbang default). */
export async function getWhatsappModelId(): Promise<string> {
  const owner = await resolveDeploymentOwnerUser();
  if (owner) {
    const settings = await getUserSettings(owner.id);
    const fromUi = settings.integrations.whatsappModel.trim();
    if (fromUi) {
      return fromUi;
    }
    const tierModels = resolveIntegrationModels(settings.integrations);
    const fromTier = tierModels.chatModel?.trim();
    if (fromTier && !fromTier.endsWith(":free") && fromTier !== "openrouter/free") {
      return fromTier;
    }
  }
  const fromEnv = process.env.WHATSAPP_MODEL?.trim();
  if (fromEnv && !fromEnv.endsWith(":free")) {
    return fromEnv;
  }
  return "x-ai/grok-4.3";
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
