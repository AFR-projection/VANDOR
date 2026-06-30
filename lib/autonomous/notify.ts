import { and, eq, gte, or, sql } from "drizzle-orm";
import { type AgentEventSeverity, agentNotification } from "@/lib/db/schema";
import { autonomousConfig } from "./config";
import { db } from "./db";
import { createLogger } from "./logger";
import { approvalShortId } from "./permission";

const log = createLogger("notify");

const memoryCooldown = new Map<string, number>();

export type NotifyInput = {
  title: string;
  body: string;
  level?: AgentEventSeverity;
  channel?: string;
  /** Lewati kirim bila notifikasi dengan title/cooldownKey sama sudah dikirim dalam jangka ini (ms). */
  cooldownMs?: number;
  /** Kunci dedupe (default: title). */
  cooldownKey?: string;
};

async function wasRecentlyNotified(
  dedupeKey: string,
  cooldownMs: number
): Promise<boolean> {
  const key = dedupeKey.slice(0, 200);
  const memAt = memoryCooldown.get(key);
  if (memAt && Date.now() - memAt < cooldownMs) {
    return true;
  }

  const since = new Date(Date.now() - cooldownMs);
  const bodyPatterns =
    key === "code-fix-failed"
      ? ["auto-fix", "scan masih gagal", "OpenRouter", "tooling"]
      : key === "proactive-alert"
        ? ["isu terdeteksi", "Alert"]
        : [];

  const recent = await db
    .select({ id: agentNotification.id })
    .from(agentNotification)
    .where(
      and(
        gte(agentNotification.createdAt, since),
        or(
          eq(agentNotification.title, key),
          ...(bodyPatterns.length > 0
            ? bodyPatterns.map(
                (p) => sql`${agentNotification.body} ILIKE ${`%${p}%`}`
              )
            : [])
        ),
        or(
          eq(agentNotification.status, "sent"),
          eq(agentNotification.status, "queued")
        )
      )
    )
    .limit(1);

  if (recent.length > 0) {
    memoryCooldown.set(key, Date.now());
    return true;
  }
  return false;
}

/**
 * Kirim notifikasi penting. Selalu tercatat di DB (AgentNotification).
 * Pengiriman WhatsApp dilakukan via endpoint internal pada proses web
 * (yang memegang koneksi Baileys). Best-effort: gagal kirim tidak fatal.
 * Return false bila dilewati karena cooldown.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  const channel = input.channel ?? "whatsapp";
  const level = input.level ?? "warn";

  if (input.cooldownMs && input.cooldownMs > 0) {
    const dedupeKey = input.cooldownKey ?? input.title;
    if (await wasRecentlyNotified(dedupeKey, input.cooldownMs)) {
      log.info(`Notifikasi dilewati (cooldown): ${dedupeKey.slice(0, 60)}`);
      return false;
    }
    memoryCooldown.set(dedupeKey.slice(0, 200), Date.now());
  }

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

  if (!sent.ok) {
    log.warn(`Gagal kirim notifikasi WA: ${sent.error ?? "unknown"}`);
  }

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

  return true;
}

async function deliver(
  input: NotifyInput,
  level: AgentEventSeverity
): Promise<{ ok: boolean; error?: string }> {
  if (!autonomousConfig.internalSecret) {
    return {
      ok: false,
      error:
        "VANDOR_AGENT_INTERNAL_SECRET kosong — isi di .env.local lalu pm2 reload --update-env",
    };
  }

  const url = `${autonomousConfig.internalApiUrl}/api/agent/notify`;
  let lastError = "unknown";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, {
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
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson.error) {
            detail = `${detail}: ${errJson.error}`;
          }
        } catch {
          /* ignore */
        }
        lastError = detail;
        if (res.status === 401 || res.status === 503) {
          return { ok: false, error: lastError };
        }
        continue;
      }
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        return { ok: true };
      }
      lastError = json.error ?? "notify rejected";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "fetch failed";
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 1) {
      await new Promise((r) => {
        setTimeout(r, 1500);
      });
    }
  }

  return { ok: false, error: lastError };
}

/** Notifikasi permintaan approval baru ke owner utama via WhatsApp. */
export async function notifyApprovalRequest(input: {
  id: string;
  summary: string;
  riskLevel: string;
}): Promise<void> {
  const short = approvalShortId(input.id);
  await notify({
    title: "Perlu persetujuan",
    body:
      `[${input.riskLevel.toUpperCase()}] ${input.summary}\n\n` +
      "Balas dari WhatsApp:\n" +
      `✅ *SETUJU ${short}*\n` +
      `❌ *TOLAK ${short}*\n\n` +
      "Atau buka Pengaturan → Operator.",
    level: "warn",
  });
}
