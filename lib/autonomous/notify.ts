import { eq } from "drizzle-orm";
import { type AgentEventSeverity, agentNotification } from "@/lib/db/schema";
import { autonomousConfig } from "./config";
import { db } from "./db";

export type NotifyInput = {
  title: string;
  body: string;
  level?: AgentEventSeverity;
  channel?: string;
};

/**
 * Kirim notifikasi penting. Selalu tercatat di DB (AgentNotification).
 * Pengiriman WhatsApp dilakukan via endpoint internal pada proses web
 * (yang memegang koneksi Baileys). Best-effort: gagal kirim tidak fatal.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const channel = input.channel ?? "whatsapp";
  const level = input.level ?? "warn";

  let id: string | null = null;
  try {
    const inserted = await db
      .insert(agentNotification)
      .values({
        channel,
        level,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 4000),
        status: "queued",
      })
      .returning({ id: agentNotification.id });
    id = inserted[0]?.id ?? null;
  } catch {
    // DB insert gagal — tetap coba kirim.
  }

  const sent = await deliver(input, level);

  if (id) {
    await db
      .update(agentNotification)
      .set({
        status: sent.ok ? "sent" : "failed",
        sentAt: sent.ok ? new Date() : null,
        error: sent.ok ? null : sent.error?.slice(0, 500),
      })
      .where(eq(agentNotification.id, id))
      .catch(() => {
        /* ignore */
      });
  }
}

async function deliver(
  input: NotifyInput,
  level: AgentEventSeverity
): Promise<{ ok: boolean; error?: string }> {
  if (!autonomousConfig.internalSecret) {
    return { ok: false, error: "VANDOR_AGENT_INTERNAL_SECRET belum diset" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(
      `${autonomousConfig.internalApiUrl}/api/agent/notify`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-agent-secret": autonomousConfig.internalSecret,
        },
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          level,
        }),
      }
    );
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { ok?: boolean; error?: string };
    return json.ok ? { ok: true } : { ok: false, error: json.error };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Notifikasi permintaan approval baru ke owner utama via WhatsApp. */
export async function notifyApprovalRequest(input: {
  id: string;
  summary: string;
  riskLevel: string;
}): Promise<void> {
  const short = input.id.replace(/-/g, "").slice(0, 8).toLowerCase();
  await notify({
    title: "Perlu persetujuan",
    body:
      `[${input.riskLevel.toUpperCase()}] ${input.summary}\n\n` +
      `Balas dari WhatsApp:\n` +
      `✅ *SETUJU ${short}*\n` +
      `❌ *TOLAK ${short}*\n\n` +
      `Atau buka Pengaturan → Operator.`,
    level: "warn",
  });
}
