import { autonomousConfig } from "./config";
import { createLogger } from "./logger";

const log = createLogger("notify-ping");

/** Cek worker → web secret & koneksi WA (tanpa kirim pesan). */
export async function pingNotifyChannel(): Promise<{
  ok: boolean;
  whatsappStatus?: string;
  error?: string;
}> {
  if (!autonomousConfig.internalSecret) {
    return {
      ok: false,
      error:
        "VANDOR_AGENT_INTERNAL_SECRET kosong — tambahkan ke .env.local (openssl rand -hex 24)",
    };
  }

  const url = `${autonomousConfig.internalApiUrl}/api/agent/notify`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "x-agent-secret": autonomousConfig.internalSecret,
      },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      whatsappStatus?: string;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.error ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      whatsappStatus: json.whatsappStatus,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function logNotifyChannelHealth(): Promise<void> {
  const ping = await pingNotifyChannel();
  if (ping.ok) {
    log.info(
      `Notify channel OK (web reachable, WA=${ping.whatsappStatus ?? "?"})`
    );
    if (ping.whatsappStatus !== "connected") {
      log.warn(
        "WhatsApp belum connected — alert Operator tidak sampai ke WA sampai QR terscan"
      );
    }
    return;
  }
  log.warn(`Notify channel GAGAL: ${ping.error ?? "unknown"}`);
}
