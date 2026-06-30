/**
 * VANDOR WhatsApp bridge — always-on Baileys process for Railway/VPS/laptop.
 * Forwards owner messages to VANDOR (Vercel) /api/whatsapp/ingest and sends replies back.
 */
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, ".whatsapp-auth");
const PORT = Number(process.env.PORT ?? "8080");

const VANDOR_URL = (process.env.VANDOR_APP_URL ?? "").replace(/\/$/, "");
const BRIDGE_SECRET = (process.env.WHATSAPP_BRIDGE_SECRET ?? "").trim();
const OWNER_RAW = process.env.WHATSAPP_OWNER_NUMBERS ?? "";

function normalizePhone(input) {
  return String(input ?? "").replace(/\D/g, "");
}

const ownerNumbers = OWNER_RAW.split(",")
  .map((n) => normalizePhone(n))
  .filter((n) => n.length >= 6);

function isOwner(fromJid) {
  const digits = normalizePhone(fromJid.split("@")[0]);
  if (ownerNumbers.length === 0) {
    return digits.length >= 6;
  }
  return ownerNumbers.some(
    (owner) => owner === digits || digits.endsWith(owner)
  );
}

function extractText(message) {
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

function requireEnv() {
  const missing = [];
  if (!VANDOR_URL) {
    missing.push("VANDOR_APP_URL");
  }
  if (BRIDGE_SECRET.length < 8) {
    missing.push("WHATSAPP_BRIDGE_SECRET (min. 8 karakter)");
  }
  if (missing.length > 0) {
    console.error("[bridge] Env wajib belum lengkap:", missing.join(", "));
    process.exit(1);
  }
}

async function forwardToVandor(from, text, name) {
  const res = await fetch(`${VANDOR_URL}/api/whatsapp/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_SECRET}`,
    },
    body: JSON.stringify({ from, text, name }),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`VANDOR ingest bukan JSON (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(json.error ?? `VANDOR ingest gagal (${res.status})`);
  }

  return json;
}

async function startWhatsapp() {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(
        "[bridge] Scan QR di log Railway / terminal (Perangkat tertaut)."
      );
    }
    if (connection === "open") {
      const me = sock.user?.id?.split(":")[0];
      console.log(`[bridge] WhatsApp terhubung sebagai +${me ?? "?"}`);
    }
    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode ??
        lastDisconnect?.error?.output?.payload?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        console.error(
          "[bridge] Logged out — hapus volume auth & scan QR lagi."
        );
        process.exit(1);
      }
      console.log("[bridge] Putus, reconnect 3s…");
      setTimeout(() => {
        void startWhatsapp();
      }, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") {
      return;
    }

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe || !msg.key.remoteJid) {
        continue;
      }
      if (msg.key.remoteJid.endsWith("@g.us")) {
        continue;
      }

      const from = normalizePhone(msg.key.remoteJid.split("@")[0]);
      if (!isOwner(from)) {
        continue;
      }

      const text = extractText(msg.message);
      if (!text) {
        continue;
      }

      const pushName =
        typeof msg.pushName === "string" ? msg.pushName : undefined;

      try {
        console.log(`[bridge] → VANDOR +${from}: ${text.slice(0, 80)}`);
        const result = await forwardToVandor(from, text, pushName);
        if (result.ignored) {
          continue;
        }
        const reply =
          typeof result.reply === "string" ? result.reply.trim() : "";
        if (reply) {
          const jid = `${from}@s.whatsapp.net`;
          await sock.sendMessage(jid, { text: reply });
          console.log(`[bridge] ← balasan terkirim ke +${from}`);
        }
      } catch (err) {
        console.error("[bridge] Gagal proses pesan:", err);
        try {
          await sock.sendMessage(`${from}@s.whatsapp.net`, {
            text: "Maaf, VANDOR lagi bermasalah. Coba lagi sebentar.",
          });
        } catch {
          // ignore
        }
      }
    }
  });
}

function startHealthServer() {
  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("vandor whatsapp bridge ok\n");
  }).listen(PORT, () => {
    console.log(`[bridge] Health check :${PORT}/`);
  });
}

requireEnv();
startHealthServer();
console.log(`[bridge] VANDOR target: ${VANDOR_URL}`);
console.log(
  `[bridge] Owner filter: ${
    ownerNumbers.length > 0 ? ownerNumbers.join(", ") : "semua nomor 1:1"
  }`
);
void startWhatsapp();
