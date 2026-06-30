import { collectSystemAwareness } from "./awareness";
import { composeOperatorWhatsappMessage } from "./compose-message";
import { autonomousConfig } from "./config";
import type { Issue, ObservationBundle } from "./healing/detectors";
import type { HeartbeatSnapshot } from "./heartbeat";
import { getLatestHeartbeat, touchProactiveHeartbeat } from "./heartbeat";
import { createLogger } from "./logger";
import { notify } from "./notify";

const log = createLogger("proactive");

function msSince(iso: string | null | undefined): number {
  if (!iso) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - new Date(iso).getTime();
}

function fallbackAlert(issues: Issue[], obs: ObservationBundle): string {
  const top = issues.slice(0, 3);
  const lines = top.map(
    (i, n) => `${n + 1}. [${i.severity}] ${i.title}: ${i.detail.slice(0, 100)}`
  );
  const m = obs.metrics;
  return (
    `Ada ${issues.length} isu — CPU ${m.cpuPct}% RAM ${m.memUsedPct}%.\n\n` +
    `${lines.join("\n")}\n\nBalas bebas kalau mau kubantu cek lebih lanjut.`
  );
}

function fallbackCheckIn(
  hb: HeartbeatSnapshot | null,
  obs: ObservationBundle
): string {
  const m = obs.metrics;
  return (
    `Halo! Skor kesehatan ${hb?.healthScore ?? "?"}/100. ` +
    `CPU ${m.cpuPct}% · RAM ${m.memUsedPct}%.\n\n` +
    "Ada yang perlu kubantu hari ini?"
  );
}

export type ProactiveRunResult = {
  checkInSent: boolean;
  alertSent: boolean;
};

/**
 * Outreach proaktif ke owner utama via WA — pesan dari LLM + data nyata.
 */
export async function runProactiveOutreach(input: {
  obs: ObservationBundle;
  issues: Issue[];
  heartbeat: HeartbeatSnapshot | null;
  autonomous: boolean;
}): Promise<ProactiveRunResult> {
  const result: ProactiveRunResult = { checkInSent: false, alertSent: false };

  const hb = input.heartbeat ?? (await getLatestHeartbeat());
  const checkInCooldown = autonomousConfig.proactiveCheckInMs;
  const alertCooldown = autonomousConfig.proactiveAlertMs;
  const snapshot = await collectSystemAwareness({ live: false });

  const hasCritical = input.issues.some((i) => i.severity === "critical");
  const hasError = input.issues.some((i) => i.severity === "error");

  if (
    input.issues.length > 0 &&
    (hasCritical || hasError) &&
    msSince(hb?.proactive?.lastAlertAt) >= alertCooldown
  ) {
    const body =
      (await composeOperatorWhatsappMessage({
        kind: "alert",
        snapshot,
        obs: input.obs,
        issues: input.issues,
      })) ?? fallbackAlert(input.issues, input.obs);

    await notify({
      title: "VANDOR",
      body,
      level: hasCritical ? "critical" : "warn",
      cooldownMs: alertCooldown,
      cooldownKey: "proactive-alert",
    });
    await touchProactiveHeartbeat("alert");
    result.alertSent = true;
    log.info(`Proactive alert — ${input.issues.length} isu`);
  }

  const dueCheckIn = msSince(hb?.proactive?.lastCheckInAt) >= checkInCooldown;

  if (dueCheckIn && input.issues.length === 0) {
    let body =
      input.autonomous && autonomousConfig.proactiveUseLlm
        ? await composeOperatorWhatsappMessage({
            kind: "checkin",
            snapshot,
            obs: input.obs,
            issues: input.issues,
          })
        : null;
    body ??= fallbackCheckIn(hb, input.obs);

    await notify({
      title: "VANDOR",
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
      (await composeOperatorWhatsappMessage({
        kind: "checkin",
        snapshot,
        obs: input.obs,
        issues: input.issues,
      })) ??
      `${fallbackAlert(input.issues, input.obs)}\n\nAda prioritas khusus?`;

    await notify({
      title: "VANDOR",
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

  const snapshot = await collectSystemAwareness({ live: false });
  const body =
    (await composeOperatorWhatsappMessage({
      kind: "startup",
      snapshot,
    })) ??
    "Worker aktif — aku memantau sistem 24/7. Balas bebas kalau ada yang perlu dicek.";

  await notify({
    title: "VANDOR",
    body,
    level: "info",
  });
  await touchProactiveHeartbeat("checkIn");
}
