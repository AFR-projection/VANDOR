import { autonomousConfig } from "./config";
import type { HeartbeatSnapshot } from "./heartbeat";
import { getLatestHeartbeat, touchProactiveHeartbeat } from "./heartbeat";
import type { Issue } from "./healing/detectors";
import type { ObservationBundle } from "./healing/detectors";
import { isLlmConfigured, llmChat } from "./llm";
import { createLogger } from "./logger";
import { notify } from "./notify";

const log = createLogger("proactive");

function msSince(iso: string | null | undefined): number {
  if (!iso) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - new Date(iso).getTime();
}

function formatMetricsLine(obs: ObservationBundle): string {
  const m = obs.metrics;
  return `CPU ${m.cpuPct}% · RAM ${m.memUsedPct}% · Disk ${m.diskUsedPct ?? "?"}%`;
}

function buildHealthyCheckIn(
  heartbeat: HeartbeatSnapshot | null,
  obs: ObservationBundle
): string {
  const score = heartbeat?.healthScore ?? "?";
  const lines = [
    `Halo! VANDOR Operator aktif — skor kesehatan *${score}/100* (${heartbeat?.grade ?? "?"})`,
    formatMetricsLine(obs),
    "",
    "Ada yang perlu kubantu hari ini?",
    "• Cek server / deploy / log?",
    "• Scan codebase atau perbaiki error?",
    "• Pantau uptime atau backup?",
    "",
    "Balas bebas (contoh: *scan*, *status*, *cek log*) atau buka Pengaturan → Operator.",
  ];
  return lines.join("\n");
}

function buildIssueAlert(issues: Issue[], obs: ObservationBundle): string {
  const top = issues.slice(0, 4);
  const lines = top.map(
    (i, n) => `${n + 1}. [${i.severity.toUpperCase()}] ${i.title}\n   ${i.detail.slice(0, 120)}`
  );
  return (
    `⚠️ *${issues.length} isu terdeteksi* — VANDOR sudah mulai investigasi.\n\n` +
    `${lines.join("\n\n")}\n\n` +
    `${formatMetricsLine(obs)}\n\n` +
    `Auto-fix aktif bila memungkinkan. Ada yang mau dicek lebih lanjut? Balas *status* atau *scan*.`
  );
}

async function buildLlmCheckIn(
  heartbeat: HeartbeatSnapshot | null,
  obs: ObservationBundle,
  issues: Issue[]
): Promise<string | null> {
  if (!isLlmConfigured()) {
    return null;
  }

  const prompt = `Kamu VANDOR Operator — asisten proaktif owner VPS.
Tulis pesan WhatsApp singkat (Bahasa Indonesia, max 8 baris) untuk owner utama.
Tujuan: tanya apa yang perlu dibantu, tawarkan cek yang relevan, terdengar natural (bukan robot).
Jangan pakai markdown berlebihan. Sertakan 1-2 pertanyaan konkret.

Konteks:
- Skor kesehatan: ${heartbeat?.healthScore ?? "?"}/100
- ${formatMetricsLine(obs)}
- Isu aktif: ${issues.length}
- Mode: ${heartbeat?.mode ?? "?"}`;

  const text = await llmChat(prompt, {
    temperature: 0.55,
    maxTokens: 350,
    timeoutMs: 20_000,
  });
  return text?.trim().slice(0, 900) ?? null;
}

export type ProactiveRunResult = {
  checkInSent: boolean;
  alertSent: boolean;
};

/**
 * Outreach proaktif ke owner utama via WA — tanpa menunggu ditanya.
 * Cooldown agar tidak spam; alert isu baru lebih agresif.
 */
export async function runProactiveOutreach(input: {
  obs: ObservationBundle;
  issues: Issue[];
  heartbeat: HeartbeatSnapshot | null;
  autonomous: boolean;
}): Promise<ProactiveRunResult> {
  const result: ProactiveRunResult = { checkInSent: false, alertSent: false };

  const hb =
    input.heartbeat ?? (await getLatestHeartbeat());
  const checkInCooldown = autonomousConfig.proactiveCheckInMs;
  const alertCooldown = autonomousConfig.proactiveAlertMs;

  const hasCritical = input.issues.some((i) => i.severity === "critical");
  const hasError = input.issues.some((i) => i.severity === "error");

  if (
    input.issues.length > 0 &&
    (hasCritical || hasError) &&
    msSince(hb?.proactive?.lastAlertAt) >= alertCooldown
  ) {
    await notify({
      title: hasCritical ? "Alert Kritis" : "Perhatian Diperlukan",
      body: buildIssueAlert(input.issues, input.obs),
      level: hasCritical ? "critical" : "warn",
    });
    await touchProactiveHeartbeat("alert");
    result.alertSent = true;
    log.info(`Proactive alert — ${input.issues.length} isu`);
  }

  const dueCheckIn =
    msSince(hb?.proactive?.lastCheckInAt) >= checkInCooldown;

  if (dueCheckIn && input.issues.length === 0) {
    let body = buildHealthyCheckIn(hb, input.obs);
    if (input.autonomous && autonomousConfig.proactiveUseLlm) {
      const llm = await buildLlmCheckIn(hb, input.obs, input.issues);
      if (llm) {
        body = llm;
      }
    }

    await notify({
      title: "Check-in Operator",
      body,
      level: "info",
    });
    await touchProactiveHeartbeat("checkIn");
    result.checkInSent = true;
    log.info("Proactive check-in terkirim ke owner");
  }

  if (
    dueCheckIn &&
    input.issues.length > 0 &&
    !result.alertSent &&
    msSince(hb?.proactive?.lastCheckInAt) >= checkInCooldown
  ) {
    const body =
      (await buildLlmCheckIn(hb, input.obs, input.issues)) ??
      `${buildIssueAlert(input.issues, input.obs)}\n\nAda prioritas khusus yang mau dicek?`;

    await notify({
      title: "Update Operator",
      body,
      level: "warn",
    });
    await touchProactiveHeartbeat("checkIn");
    result.checkInSent = true;
  }

  return result;
}

/** Check-in sekali saat worker startup (cooldown pendek). */
export async function sendWorkerStartupPing(): Promise<void> {
  const hb = await getLatestHeartbeat();
  if (msSince(hb?.proactive?.lastCheckInAt) < 5 * 60_000) {
    return;
  }

  await notify({
    title: "Operator Online",
    body:
      "VANDOR Operator worker aktif dan memantau sistem 24/7.\n\n" +
      "Mau kubantu cek apa? Balas *status*, *scan*, atau tulis kebutuhanmu.",
    level: "info",
  });
  await touchProactiveHeartbeat("checkIn");
}
