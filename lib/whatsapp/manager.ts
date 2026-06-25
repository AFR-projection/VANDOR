import "server-only";

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type {
  ConnectionState,
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";
import { getOwnerCredentials } from "@/lib/security/gate";
import { resolveDeploymentOwnerUser } from "./deployment-owner";
import { deriveWhatsappChatId, normalizeWhatsappNumber } from "./config";
import {
  addWhatsappOwner,
  getActiveOwnerPhones,
  validateAndConsumeCode,
} from "./queries";
import { runWhatsappAgentTurn } from "./run-agent-turn";
import { formatWaAgentError } from "./format-agent-error";
import { deliverWhatsappMediaDownload } from "./media-delivery";
import {
  extractInboundMedia,
  hasInboundMedia,
} from "./inbound-media";
import { isWhatsappVaultSaveCommand } from "./vault-ingest";
import { deliverWhatsappOutboundMedia } from "./outbound-media";
import {
  matchesOwnerList,
  resolveSenderIdentity,
  senderOwnerKeys,
  type SenderIdentity,
} from "./sender-identity";

export type WhatsappStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "connected"
  | "logged_out"
  | "error";

export type WhatsappState = {
  status: WhatsappStatus;
  qr: string | null;
  me: string | null;
  error: string | null;
  updatedAt: number;
};

type Manager = {
  sock: WASocket | null;
  state: WhatsappState;
  connecting: boolean;
};

const AUTH_DIR = path.join(process.cwd(), ".whatsapp-auth");

/** Verification codes must match XXXX-XXXX (8 uppercase alphanum + dash). */
const CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const globalForWa = globalThis as unknown as {
  __vandorWaManager?: Manager;
};

function getManager(): Manager {
  if (!globalForWa.__vandorWaManager) {
    globalForWa.__vandorWaManager = {
      sock: null,
      connecting: false,
      state: {
        status: "idle",
        qr: null,
        me: null,
        error: null,
        updatedAt: Date.now(),
      },
    };
  }
  return globalForWa.__vandorWaManager;
}

function setState(patch: Partial<WhatsappState>): void {
  const m = getManager();
  m.state = { ...m.state, ...patch, updatedAt: Date.now() };
}

export function getWhatsappState(): WhatsappState {
  return getManager().state;
}

function extractText(message: WAMessage["message"]): string {
  if (!message) {
    return "";
  }
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    ""
  ).trim();
}

async function registerOwnerKeys(
  userId: string,
  identity: SenderIdentity
): Promise<void> {
  for (const key of senderOwnerKeys(identity)) {
    await addWhatsappOwner(userId, key);
  }
}

/**
 * Try to handle the message as a verification code.
 * Returns true if the message was a code attempt (success or failure) so the
 * caller knows it should not be forwarded to the normal agent turn.
 */
async function tryHandleVerifCode(
  sock: WASocket,
  identity: SenderIdentity,
  text: string,
  ownerUser: { id: string },
  msg: WAMessage
): Promise<boolean> {
  const candidate = text.trim().toUpperCase();
  if (!CODE_RE.test(candidate)) {
    return false;
  }

  const ownerKeys = senderOwnerKeys(identity);
  const primaryKey = ownerKeys[0] ?? identity.lid ?? identity.phone ?? "";

  const result = await validateAndConsumeCode(candidate, primaryKey);

  let reply: string;
  if (result.ok) {
    if (result.userId !== ownerUser.id) {
      reply =
        "❌ *Kode valid tapi akun tidak cocok.*\n\nGenerate kode dari akun owner yang sama dengan VANDOR_OWNER_EMAIL di website.";
    } else {
      await registerOwnerKeys(ownerUser.id, identity);
      const label = identity.phone
        ? `+${identity.phone}`
        : `LID ${identity.lid}`;
      reply =
        `✅ *Verifikasi berhasil!*\n\nWhatsApp kamu (${label}) sudah terdaftar sebagai Owner VANDOR.\n\nMulai sekarang kamu bisa memberikan perintah langsung dari WhatsApp ini. Ketik apa saja untuk memulai!`;
    }
  } else if (result.reason === "expired") {
    reply = `⏰ *Kode kedaluwarsa.*\n\nKode sudah tidak berlaku. Buka website VANDOR → Pengaturan → WhatsApp → Generate kode baru.`;
  } else if (result.reason === "used") {
    reply = `🚫 *Kode sudah dipakai.*\n\nKode hanya bisa digunakan satu kali. Buka website VANDOR → Pengaturan → WhatsApp → Generate kode baru.`;
  } else {
    reply = `❌ *Kode tidak dikenali.*\n\nPastikan kamu mengirim kode yang benar (format: XXXX-XXXX). Buka website VANDOR → Pengaturan → WhatsApp → Generate kode baru.`;
  }

  await sock.sendMessage(identity.replyJid, { text: reply }, { quoted: msg });
  return true;
}

async function handleIncoming(
  sock: WASocket,
  msg: WAMessage,
  ownerUser: { id: string }
): Promise<void> {
  const identity = await resolveSenderIdentity(sock, msg);
  if (!identity) {
    return;
  }

  const text = extractText(msg.message);
  const inboundMedia = hasInboundMedia(msg.message)
    ? await extractInboundMedia(sock, msg)
    : null;

  if (!text && !inboundMedia) {
    return;
  }

  const jid = identity.replyJid;

  try {
    await sock.readMessages([msg.key]);
    await sock.sendPresenceUpdate("composing", jid);
  } catch {
    // non-fatal
  }

  // 1. Coba handle sebagai kode verifikasi (siapapun bisa coba kirim kode).
  let wasCode = false;
  try {
    wasCode = await tryHandleVerifCode(sock, identity, text, ownerUser, msg);
  } catch (err) {
    console.error("[wa] verif code handler error:", err);
    await sock
      .sendMessage(
        jid,
        { text: "❌ Terjadi kesalahan saat memvalidasi kode. Coba lagi sebentar." },
        { quoted: msg }
      )
      .catch(() => {
        // ignore send error
      });
  }
  if (wasCode) {
    try {
      await sock.sendPresenceUpdate("paused", jid);
    } catch {
      // non-fatal
    }
    return;
  }

  // 2. Bukan kode → cek apakah nomor ini adalah owner yang terdaftar.
  const ownerPhones = await getActiveOwnerPhones(ownerUser.id);

  // Optional env whitelist (backward compat). These are in addition to DB owners.
  const envPhones = (process.env.WHATSAPP_OWNER_NUMBERS ?? "")
    .split(",")
    .map((n) => normalizeWhatsappNumber(n))
    .filter(Boolean);
  const allOwnerPhones = new Set([...ownerPhones, ...envPhones]);

  // STRICT: caller must be a registered owner. Empty list = nobody allowed.
  // (Unlike before, we no longer treat an empty list as "allow all".)
  const isOwner = matchesOwnerList(identity, allOwnerPhones);

  console.log(
    `[wa] owner check phone=${identity.phone ?? "-"} lid=${identity.lid ?? "-"}: isOwner=${isOwner} registeredOwners=${allOwnerPhones.size}`
  );

  if (!isOwner) {
    // Silently drop — do NOT reply so the bot stays private.
    console.log(
      `[wa] ignoring message from non-owner phone=${identity.phone ?? "-"} lid=${identity.lid ?? "-"}`
    );
    return;
  }

  // 3. Owner terverifikasi → simpan media ke vault (/vault, simpan vault, …).
  if (inboundMedia && isWhatsappVaultSaveCommand(text)) {
    try {
      const { ingestWhatsappMediaToVault, vaultSaveReplyText } = await import(
        "./vault-ingest"
      );
      const result = await ingestWhatsappMediaToVault({
        sessionUserId: ownerUser.id,
        chatId: deriveWhatsappChatId(identity.phone ?? identity.lid ?? ""),
        media: inboundMedia,
        caption: inboundMedia.caption,
      });
      await sock.sendMessage(
        jid,
        { text: vaultSaveReplyText(result) },
        { quoted: msg }
      );
    } catch (err) {
      console.error("[wa] vault ingest error:", err);
      await sock
        .sendMessage(
          jid,
          { text: "❌ Gagal menyimpan ke berangkas. Coba lagi." },
          { quoted: msg }
        )
        .catch(() => null);
    }
    try {
      await sock.sendPresenceUpdate("paused", jid);
    } catch {
      // non-fatal
    }
    return;
  }

  // 4. Owner terverifikasi → cek unduhan media (/tt, /ytv, /yts, /ig).
  try {
    const mediaResult = await deliverWhatsappMediaDownload(
      sock,
      jid,
      text,
      msg,
      ownerUser.id
    );
    if (mediaResult.handled) {
      try {
        await sock.sendPresenceUpdate("paused", jid);
      } catch {
        // non-fatal
      }
      return;
    }
  } catch (err) {
    console.error("[wa] media download error:", err);
    await sock
      .sendMessage(
        jid,
        { text: "❌ Gagal memproses unduhan media. Coba lagi." },
        { quoted: msg }
      )
      .catch(() => null);
    return;
  }

  // 5. Owner terverifikasi → jalankan agent turn.
  let reply = "Maaf, ada error saat memproses pesan. Coba lagi ya.";
  let outbound: Awaited<
    ReturnType<typeof runWhatsappAgentTurn>
  >["outbound"] = [];
  try {
    const result = await runWhatsappAgentTurn({
      userId: ownerUser.id,
      chatId: deriveWhatsappChatId(identity.phone ?? identity.lid ?? ""),
      text,
      senderName: msg.pushName ?? undefined,
      media: inboundMedia ? [inboundMedia] : [],
    });
    reply = result.reply;
    outbound = result.outbound;
  } catch (error) {
    console.error("[wa] agent turn failed:", error);
    reply = formatWaAgentError(error);
  }

  try {
    await sock.sendPresenceUpdate("paused", jid);
  } catch {
    // non-fatal
  }

  if (reply.trim()) {
    console.log(`[wa] sending reply to ${jid}: "${reply.slice(0, 80)}"`);
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    console.log(`[wa] reply sent ok to ${jid}`);
  }

  if (outbound.length > 0) {
    try {
      await deliverWhatsappOutboundMedia(sock, jid, outbound, msg);
      console.log(`[wa] sent ${outbound.length} outbound media to ${jid}`);
    } catch (err) {
      console.error("[wa] outbound media delivery failed:", err);
      await sock
        .sendMessage(
          jid,
          {
            text: "⚠️ File hasil generate gagal dikirim. Coba minta ulang ya.",
          },
          { quoted: msg }
        )
        .catch(() => null);
    }
  }
}

async function wireSocket(sock: WASocket, saveCreds: () => Promise<void>) {
  const { DisconnectReason } = await import("@whiskeysockets/baileys");
  const QRCode = (await import("qrcode")).default;

  const ownerUserPromise = resolveDeploymentOwnerUser();

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        setState({ status: "qr", qr: dataUrl, error: null });
      } catch {
        setState({ status: "qr", qr: null });
      }
    }

    if (connection === "open") {
      const m = getManager();
      const me = m.sock?.user?.id?.split(":")[0] ?? null;
      console.log(`[wa] ✅ Terhubung sebagai +${me}`);
      setState({
        status: "connected",
        qr: null,
        error: null,
        me,
      });
    }

    if (connection === "close") {
      const statusCode = (
        lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      )?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const m = getManager();
      m.sock = null;
      m.connecting = false;

      if (loggedOut) {
        setState({ status: "logged_out", qr: null, me: null });
        await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {
          // ignore
        });
      } else {
        setState({ status: "connecting", qr: null });
        setTimeout(() => {
          void connectWhatsapp();
        }, 2500);
      }
    }
  });

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type,
    }: {
      messages: WAMessage[];
      type: string;
    }) => {
      console.log(`[wa] messages.upsert type=${type} count=${messages.length}`);

      // "notify" = new real-time message; "append" = history sync on connect.
      // We handle both but only process messages from last 5 minutes for "append"
      // to avoid replaying old history endlessly.
      const isHistory = type === "append";
      const cutoff = Date.now() - 5 * 60 * 1000;

      const ownerUser = await ownerUserPromise;
      if (!ownerUser) {
        console.warn("[wa] ownerUser null — skip messages");
        return;
      }

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) {
          continue;
        }

        const msgTimestamp =
          (typeof msg.messageTimestamp === "number"
            ? msg.messageTimestamp
            : msg.messageTimestamp?.toNumber?.() ?? 0) * 1000;

        if (isHistory && msgTimestamp < cutoff) {
          continue; // Skip old history
        }

        const text = extractText(msg.message);
        console.log(`[wa] incoming from=${msg.key.remoteJid} text="${text.slice(0, 60)}"`);

        try {
          await handleIncoming(sock, msg, ownerUser);
        } catch (err) {
          console.error("[wa] unhandled message error:", err);
        }
      }
    }
  );
}

export async function connectWhatsapp(): Promise<WhatsappState> {
  const m = getManager();
  if (m.sock || m.connecting) {
    return m.state;
  }
  if (!getOwnerCredentials()) {
    setState({ status: "error", error: "VANDOR_OWNER_EMAIL belum diset." });
    return m.state;
  }

  m.connecting = true;
  setState({ status: "connecting", qr: null, error: null });

  try {
    await mkdir(AUTH_DIR, { recursive: true });
    const { default: makeWASocket, useMultiFileAuthState } = await import(
      "@whiskeysockets/baileys"
    );
    const pino = (await import("pino")).default;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const sock = makeWASocket({
      auth: state,
      // biome-ignore lint/suspicious/noExplicitAny: pino logger shape differs across versions
      logger: pino({ level: "silent" }) as any,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    m.sock = sock;
    await wireSocket(sock, saveCreds);
    m.connecting = false;
    return m.state;
  } catch (error) {
    m.connecting = false;
    m.sock = null;
    setState({
      status: "error",
      error:
        error instanceof Error ? error.message : "Gagal connect WhatsApp.",
    });
    return m.state;
  }
}

export async function logoutWhatsapp(): Promise<WhatsappState> {
  const m = getManager();
  try {
    await m.sock?.logout();
  } catch {
    // ignore
  }
  m.sock = null;
  m.connecting = false;
  await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {
    // ignore
  });
  setState({ status: "idle", qr: null, me: null, error: null });
  return m.state;
}
