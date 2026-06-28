import "server-only";

import type { WASocket } from "@whiskeysockets/baileys";
import { normalizeWhatsappNumber } from "./phone";

/** Resolve JID via onWhatsApp (lebih reliable untuk nomor internasional). */
export async function resolveWhatsappJid(
  sock: WASocket,
  phone: string
): Promise<string> {
  const normalized = normalizeWhatsappNumber(phone);
  if (!normalized) {
    throw new Error("Nomor kosong");
  }

  try {
    const results = await sock.onWhatsApp(normalized);
    const hit = results?.find((r) => r.exists && r.jid);
    if (hit?.jid) {
      return hit.jid;
    }
  } catch {
    // fallback ke format klasik
  }

  return `${normalized}@s.whatsapp.net`;
}

export async function sendTextToPhone(
  sock: WASocket,
  phone: string,
  text: string
): Promise<void> {
  const jid = await resolveWhatsappJid(sock, phone);
  await sock.sendMessage(jid, { text });
}
