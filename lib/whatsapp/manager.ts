import "server-only";

import { mkdir } from "node:fs/promises";
import type {
  ConnectionState,
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";
import { getOwnerCredentials } from "@/lib/security/gate";
import { resolveDeploymentOwnerUser } from "./deployment-owner";
import {
  deriveWhatsappChatId,
  getOwnerWhatsappNumbers,
  getPrimaryWhatsappOwner,
  normalizeWhatsappNumber,
} from "./config";
import {
  addWhatsappOwner,
  getActiveOwnerPhones,
  revokeWhatsappOwner,
  validateAndConsumeCode,
} from "./queries";
import { sendTextToPhone } from "./jid";
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
  clearPersistedWhatsappAuth,
  hydrateAuthDir,
  persistAuthDir,
  wipeAuthDir,
} from "./auth-persist";
import { getWhatsappAuthDir, isWhatsappServerlessHost } from "./auth-path";
import {
  clearWhatsappState,
  loadWhatsappState,
  mergeWhatsappStates,
  saveWhatsappState,
} from "./state-persist";
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
  ownerUserId: string | null;
};

const CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const globalForWa = globalThis as unknown as {
  __vandorWaManager?: Manager;
};

function getManager(): Manager {
  if (!globalForWa.__vandorWaManager) {
    globalForWa.__vandorWaManager = {
      sock: null,
      connecting: false,
      ownerUserId: null,
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
  if (m.ownerUserId) {
    void saveWhatsappState(m.ownerUserId, m.state).catch((err) => {
      console.error("[wa] gagal simpan state ke DB:", err);
    });
  }
}

export function getWhatsappState(): WhatsappState {
  return getManager().state;
}

/**
 * Kirim notifikasi sistem Operator ke owner UTAMA (Pengaturan → WhatsApp).
 * Fallback ke semua owner jika primary belum diset.
 */
export async function sendSystemWhatsappNotification(
  text: string
): Promise<{ ok: boolean; error?: string; sentTo: number; target?: string }> {
  const m = getManager();
  if (!m.sock || m.state.status !== "connected") {
    return {
      ok: false,
      error: `WhatsApp belum tersambung (status: ${m.state.status})`,
      sentTo: 0,
    };
  }

  const primary = await getPrimaryWhatsappOwner();
  let targets: string[] = [];

  if (primary) {
    targets = [primary];
  } else {
    const ownerUser = await resolveDeploymentOwnerUser();
    const phones = new Set<string>();
    if (ownerUser) {
      for (const p of await getActiveOwnerPhones(ownerUser.id)) {
        phones.add(normalizeWhatsappNumber(p));
      }
    }
    for (const p of await getOwnerWhatsappNumbers()) {
      phones.add(p);
    }
    targets = [...phones].filter((p) => p.length >= 6);
  }

  if (targets.length === 0) {
    return {
      ok: false,
      error:
        "Owner utama belum diset — buka Pengaturan → WhatsApp → Owner Utama",
      sentTo: 0,
    };
  }

  const sock = m.sock;
  const results = await Promise.allSettled(
    targets.map((phone) => sendTextToPhone(sock, phone, text))
  );
  const sentTo = results.filter((r) => r.status === "fulfilled").length;
  return {
    ok: sentTo > 0,
    sentTo,
    target: targets[0],
    error: sentTo === 0 ? "Gagal mengirim notifikasi sistem" : undefined,
  };
}

/**
 * Kirim pesan teks ke semua nomor owner (chat broadcast, bukan alert sistem).
 */
export async function sendWhatsappToOwner(
  text: string
): Promise<{ ok: boolean; error?: string; sentTo: number }> {
  const m = getManager();
  if (!m.sock || m.state.status !== "connected") {
    return {
      ok: false,
      error: `WhatsApp belum tersambung (status: ${m.state.status})`,
      sentTo: 0,
    };
  }

  const ownerUser = await resolveDeploymentOwnerUser();
  const phones = new Set<string>();
  if (ownerUser) {
    for (const p of await getActiveOwnerPhones(ownerUser.id)) {
      phones.add(normalizeWhatsappNumber(p));
    }
  }
  for (const p of await getOwnerWhatsappNumbers()) {
    phones.add(p);
  }
  const list = [...phones].filter((p) => p.length >= 6);
  if (list.length === 0) {
    return { ok: false, error: "Tidak ada nomor owner terdaftar", sentTo: 0 };
  }

  const sock = m.sock;
  const results = await Promise.allSettled(
    list.map((phone) => sendTextToPhone(sock, phone, text))
  );
  const sentTo = results.filter((r) => r.status === "fulfilled").length;
  return {
    ok: sentTo > 0,
    sentTo,
    error: sentTo === 0 ? "Gagal mengirim ke semua nomor owner" : undefined,
  };
}

const idleState = (): WhatsappState => ({
  status: "idle",
  qr: null,
  me: null,
  error: null,
  updatedAt: Date.now(),
});

export async function getWhatsappPublicState(): Promise<WhatsappState> {
  const ownerUser = await resolveDeploymentOwnerUser();
  if (!ownerUser) {
    return idleState();
  }
  const persisted = await loadWhatsappState(ownerUser.id);
  return mergeWhatsappStates(getManager().state, persisted);
}

function isReadyState(state: WhatsappState): boolean {
  if (state.status === "connected" || state.status === "error") {
    return true;
  }
  return state.status === "qr" && Boolean(state.qr);
}

export async function waitForWhatsappPublicState(
  timeoutMs: number
): Promise<WhatsappState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getWhatsappPublicState();
    if (isReadyState(state)) {
      return state;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }
  return await getWhatsappPublicState();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  if (identity.phone) {
    const label = identity.lid ? `lid:${identity.lid}` : undefined;
    await addWhatsappOwner(userId, identity.phone, label);
    if (identity.lid) {
      await revokeWhatsappOwner(userId, identity.lid).catch(() => {
        /* LID row mungkin belum ada */
      });
    }
  } else if (identity.lid) {
    await addWhatsappOwner(userId, identity.lid, "whatsapp-lid-only");
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
  const mediaAttached = hasInboundMedia(msg.message);
  const inboundMedia = mediaAttached
    ? await extractInboundMedia(sock, msg)
    : null;

  if (!text && !mediaAttached) {
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

  // 2b. Perintah Operator (setuju/tolak/antrian) — owner utama.
  try {
    const { handleOperatorWhatsappCommand } = await import(
      "./operator-commands"
    );
    const op = await handleOperatorWhatsappCommand(text, identity);
    if (op.handled && op.reply) {
      await sock.sendMessage(jid, { text: op.reply }, { quoted: msg });
      try {
        await sock.sendPresenceUpdate("paused", jid);
      } catch {
        // non-fatal
      }
      return;
    }
  } catch (err) {
    console.error("[wa] operator command error:", err);
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

  // 4. Owner terverifikasi → cek unduhan media (/tt, /ig).
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
  if (mediaAttached && !inboundMedia) {
    await sock.sendMessage(
      jid,
      {
        text: "⚠️ Gagal memproses media (suara/stiker/gambar). Coba kirim ulang ya — pastikan koneksi stabil.",
      },
      { quoted: msg }
    );
    try {
      await sock.sendPresenceUpdate("paused", jid);
    } catch {
      // non-fatal
    }
    return;
  }

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

async function wireSocket(
  sock: WASocket,
  saveCreds: () => Promise<void>,
  authDir: string,
  ownerUserId: string
) {
  const { DisconnectReason } = await import("@whiskeysockets/baileys");
  const QRCode = (await import("qrcode")).default;

  const ownerUserPromise = resolveDeploymentOwnerUser();

  const persistCreds = async () => {
    await saveCreds();
    await persistAuthDir(authDir, ownerUserId);
  };

  sock.ev.on("creds.update", persistCreds);

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
        await wipeAuthDir(authDir);
        await clearPersistedWhatsappAuth(ownerUserId);
      } else if (isWhatsappServerlessHost()) {
        setState({
          status: "error",
          qr: null,
          error:
            "Sambungan putus di serverless. Klik Sambungkan lagi atau pakai bridge Railway untuk 24/7.",
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

export async function connectWhatsapp(options?: {
  holdMs?: number;
}): Promise<WhatsappState> {
  const m = getManager();
  if (m.sock) {
    if (options?.holdMs && options.holdMs > 0) {
      await sleep(options.holdMs);
    }
    return await getWhatsappPublicState();
  }
  if (m.connecting) {
    await waitForWhatsappPublicState(55_000);
    if (options?.holdMs && options.holdMs > 0) {
      await sleep(options.holdMs);
    }
    return await getWhatsappPublicState();
  }
  if (!getOwnerCredentials()) {
    setState({ status: "error", error: "VANDOR_OWNER_EMAIL belum diset." });
    return await getWhatsappPublicState();
  }

  const ownerUser = await resolveDeploymentOwnerUser();
  if (!ownerUser) {
    setState({ status: "error", error: "Owner deployment belum tersedia." });
    return await getWhatsappPublicState();
  }

  m.ownerUserId = ownerUser.id;
  const authDir = getWhatsappAuthDir();
  m.connecting = true;
  setState({ status: "connecting", qr: null, error: null });

  try {
    await hydrateAuthDir(authDir, ownerUser.id);
    await mkdir(authDir, { recursive: true });
    const { default: makeWASocket, useMultiFileAuthState } = await import(
      "@whiskeysockets/baileys"
    );
    const pino = (await import("pino")).default;

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const sock = makeWASocket({
      auth: state,
      // biome-ignore lint/suspicious/noExplicitAny: pino logger shape differs across versions
      logger: pino({ level: "silent" }) as any,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    m.sock = sock;
    await wireSocket(sock, saveCreds, authDir, ownerUser.id);
    m.connecting = false;

    await waitForWhatsappPublicState(55_000);

    if (options?.holdMs && options.holdMs > 0) {
      await sleep(options.holdMs);
    }

    return await getWhatsappPublicState();
  } catch (error) {
    m.connecting = false;
    m.sock = null;
    setState({
      status: "error",
      error:
        error instanceof Error ? error.message : "Gagal connect WhatsApp.",
    });
    return await getWhatsappPublicState();
  }
}

export async function logoutWhatsapp(): Promise<WhatsappState> {
  const m = getManager();
  const ownerUser = await resolveDeploymentOwnerUser();
  try {
    await m.sock?.logout();
  } catch {
    // ignore
  }
  m.sock = null;
  m.connecting = false;
  const authDir = getWhatsappAuthDir();
  await wipeAuthDir(authDir);
  if (ownerUser) {
    await clearPersistedWhatsappAuth(ownerUser.id);
    await clearWhatsappState(ownerUser.id);
  }
  m.ownerUserId = null;
  setState({ status: "idle", qr: null, me: null, error: null });
  return await getWhatsappPublicState();
}
