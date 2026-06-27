import { sendWhatsappToOwner } from "@/lib/whatsapp/manager";

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
export async function POST(request: Request) {
  const secret = process.env.VANDOR_AGENT_INTERNAL_SECRET ?? "";
  if (!secret) {
    return Response.json(
      { ok: false, error: "Internal secret belum dikonfigurasi" },
      { status: 503 }
    );
  }
  if (request.headers.get("x-agent-secret") !== secret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
  const text = `${emoji} *VANDOR Operator — ${body.title ?? "Notifikasi"}*\n\n${body.body ?? ""}`;

  const result = await sendWhatsappToOwner(text);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
