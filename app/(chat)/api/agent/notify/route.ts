import {
  getWhatsappState,
  sendSystemWhatsappNotification,
} from "@/lib/whatsapp/manager";

const LEVEL_EMOJI: Record<string, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
  critical: "🆘",
};

/**
 * Endpoint internal: dipanggil worker otonom (proses terpisah) untuk
 * mengirim notifikasi WhatsApp lewat koneksi Baileys di proses web ini.
 * Diamankan dengan shared secret (VANDOR_AGENT_INTERNAL_SECRET).
 */
function readAgentSecret(request: Request): string | null {
  return request.headers.get("x-agent-secret")?.trim() ?? null;
}

function configuredSecret(): string {
  return (process.env.VANDOR_AGENT_INTERNAL_SECRET ?? "").trim();
}

function authorizeAgent(request: Request): Response | null {
  const secret = configuredSecret();
  if (!secret) {
    return Response.json(
      {
        ok: false,
        error:
          "VANDOR_AGENT_INTERNAL_SECRET belum diset di .env.local — worker & vandor harus sama",
      },
      { status: 503 }
    );
  }
  const header = readAgentSecret(request);
  if (!header || header !== secret) {
    return Response.json(
      {
        ok: false,
        error:
          "Unauthorized — pastikan VANDOR_AGENT_INTERNAL_SECRET identik di worker & web, lalu pm2 reload --update-env",
      },
      { status: 401 }
    );
  }
  return null;
}

/** GET — health check koneksi worker → web (tanpa kirim WA). */
export async function GET(request: Request) {
  const denied = authorizeAgent(request);
  if (denied) {
    return denied;
  }
  const wa = getWhatsappState();
  return Response.json({
    ok: true,
    whatsappStatus: wa.status,
    secretConfigured: true,
  });
}

export async function POST(request: Request) {
  const denied = authorizeAgent(request);
  if (denied) {
    return denied;
  }

  let body: { title?: string; body?: string; level?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Body tidak valid" },
      { status: 400 }
    );
  }

  const emoji = LEVEL_EMOJI[body.level ?? "warn"] ?? "⚠️";
  const title = body.title?.trim();
  const inner = body.body?.trim() ?? "";
  const text = title && title !== "VANDOR"
    ? `${emoji} *VANDOR*\n\n*${title}*\n${inner}`
    : `${emoji} *VANDOR*\n\n${inner}`;

  const result = await sendSystemWhatsappNotification(text);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
