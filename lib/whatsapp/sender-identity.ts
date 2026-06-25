import type { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { normalizeWhatsappNumber } from "./config";

type ExtendedMessageKey = WAMessage["key"] & {
  remoteJidAlt?: string;
  senderPn?: string;
};

export type SenderIdentity = {
  /** JID used for replies (preserve @lid vs @s.whatsapp.net). */
  replyJid: string;
  /** Real phone digits when resolvable from PN / mapping. */
  phone: string | null;
  /** LID digits when remoteJid is @lid. */
  lid: string | null;
};

function digitsFromJid(jid: string): string {
  return normalizeWhatsappNumber(jid.split("@")[0] ?? "");
}

/** Resolve sender phone + LID from Baileys v7 message keys (incl. @lid privacy IDs). */
export async function resolveSenderIdentity(
  sock: WASocket,
  msg: WAMessage
): Promise<SenderIdentity | null> {
  const replyJid = msg.key.remoteJid ?? "";
  const is1to1 =
    replyJid.endsWith("@s.whatsapp.net") || replyJid.endsWith("@lid");
  if (!is1to1) {
    return null;
  }

  const key = msg.key as ExtendedMessageKey;

  if (replyJid.endsWith("@s.whatsapp.net")) {
    const phone = digitsFromJid(replyJid);
    return phone ? { replyJid, phone, lid: null } : null;
  }

  const lid = digitsFromJid(replyJid);
  if (!lid) {
    return null;
  }

  let phone: string | null = null;

  if (key.remoteJidAlt?.endsWith("@s.whatsapp.net")) {
    phone = digitsFromJid(key.remoteJidAlt);
  } else if (key.senderPn) {
    phone = normalizeWhatsappNumber(key.senderPn);
  } else {
    try {
      const mapped = await sock.signalRepository.lidMapping.getPNForLID(
        replyJid
      );
      if (mapped?.endsWith("@s.whatsapp.net")) {
        phone = digitsFromJid(mapped);
      }
    } catch {
      // mapping not available yet
    }
  }

  return { replyJid, phone: phone || null, lid };
}

/** All normalized identifiers we can match against stored owner rows. */
export function senderOwnerKeys(identity: SenderIdentity): string[] {
  const keys = new Set<string>();
  if (identity.phone) {
    keys.add(identity.phone);
  }
  if (identity.lid) {
    keys.add(identity.lid);
  }
  return [...keys];
}

export function matchesOwnerList(
  identity: SenderIdentity,
  ownerPhones: Set<string>
): boolean {
  if (ownerPhones.size === 0) {
    return false;
  }
  for (const key of senderOwnerKeys(identity)) {
    if (ownerPhones.has(key)) {
      return true;
    }
    for (const stored of ownerPhones) {
      if (key.endsWith(stored) || stored.endsWith(key)) {
        return true;
      }
    }
  }
  return false;
}
