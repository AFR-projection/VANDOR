import { listRecentAgentTasks, summarizeTaskForChat } from "./chat-dispatch";
import { autonomousConfig } from "./config";
import { listRecentEvents } from "./events";
import { detectIssues, type Issue } from "./healing/detectors";
import { getLatestHeartbeat, type HeartbeatSnapshot } from "./heartbeat";
import { collectMetrics, type SystemMetrics } from "./metrics";
import { listPendingApprovals } from "./permission";
import { collectServiceHealth, type ServiceStatus } from "./services";
import { getAgentState } from "./state";
import { checkUrls } from "./uptime";

export type SystemAwarenessSnapshot = {
  at: string;
  agent: {
    mode: string;
    status: string;
    killSwitch: boolean;
    tickCount: number;
    lastHeartbeatAt: string | null;
    heartbeatStale: boolean;
  };
  heartbeat: HeartbeatSnapshot | null;
  metrics: SystemMetrics | null;
  services: ServiceStatus[];
  uptimeDown: number;
  issues: Issue[];
  pendingApprovals: number;
  recentEvents: Array<{ severity: string; message: string }>;
  healthScore: number;
  grade: string;
  summary: string;
};

function heartbeatStale(lastAt: Date | null): boolean {
  if (!lastAt) {
    return true;
  }
  const ageMs = Date.now() - lastAt.getTime();
  return ageMs > autonomousConfig.tickIntervalMs * 4;
}

function gradeFromScore(score: number): string {
  if (score >= 90) {
    return "excellent";
  }
  if (score >= 75) {
    return "good";
  }
  if (score >= 50) {
    return "degraded";
  }
  return "critical";
}

function buildSummary(
  snapshot: Omit<SystemAwarenessSnapshot, "summary" | "at">
): string {
  const parts: string[] = [];
  parts.push(
    `Mode ${snapshot.agent.mode}, worker ${snapshot.agent.heartbeatStale ? "stale/offline" : "aktif"}`
  );
  if (snapshot.metrics) {
    parts.push(
      `CPU ${snapshot.metrics.cpuPct}% RAM ${snapshot.metrics.memUsedPct}%`
    );
  }
  if (snapshot.issues.length > 0) {
    parts.push(`${snapshot.issues.length} isu aktif`);
  } else {
    parts.push("tidak ada isu kritis");
  }
  return parts.join(" · ");
}

/** Kumpulkan snapshot sistem — live bila diminta (untuk tool checkSystem). */
export async function collectSystemAwareness(options?: {
  live?: boolean;
}): Promise<SystemAwarenessSnapshot> {
  const live = options?.live ?? false;
  const [state, heartbeat, pendingApprovals, recentEvents] = await Promise.all([
    getAgentState(),
    getLatestHeartbeat(),
    listPendingApprovals(5),
    listRecentEvents(5),
  ]);

  let metrics: SystemMetrics | null = null;
  let services: ServiceStatus[] = [];
  let uptimeDown = 0;
  let issues: Issue[] = [];

  if (live) {
    const [m, s, u] = await Promise.all([
      collectMetrics().catch(() => null),
      collectServiceHealth().catch(() => []),
      checkUrls(autonomousConfig.uptimeTargets).catch(() => []),
    ]);
    metrics = m;
    services = s;
    uptimeDown = u.filter((t) => !t.up).length;
    if (m) {
      issues = detectIssues({
        metrics: m,
        services: s,
        uptime: u,
        logs: [],
      });
    }
  } else if (heartbeat) {
    metrics = {
      host: "",
      platform: "",
      cpuPct: heartbeat.metrics.cpuPct,
      memUsedPct: heartbeat.metrics.memUsedPct,
      memUsedMb: 0,
      memTotalMb: 0,
      diskUsedPct: heartbeat.metrics.diskUsedPct,
      diskFreeGb: null,
      load1: 0,
      uptimeSec: 0,
      cpuCount: 0,
      at: heartbeat.at,
    };
    issues = heartbeat.issues.keys.map((key) => ({
      key,
      severity: "warn" as const,
      title: key,
      detail: key,
    }));
    uptimeDown = heartbeat.metrics.uptimeDown;
  }

  const healthScore =
    heartbeat?.healthScore ??
    (issues.some((i) => i.severity === "critical")
      ? 40
      : issues.length > 0
        ? 65
        : 90);

  const base = {
    agent: {
      mode: state.mode,
      status: state.killSwitch ? "kill-switch" : state.status,
      killSwitch: state.killSwitch,
      tickCount: state.tickCount,
      lastHeartbeatAt: state.lastHeartbeatAt?.toISOString() ?? null,
      heartbeatStale: heartbeatStale(state.lastHeartbeatAt),
    },
    heartbeat,
    metrics,
    services,
    uptimeDown,
    issues,
    pendingApprovals: pendingApprovals.length,
    recentEvents: recentEvents.map((e) => ({
      severity: e.severity,
      message: e.message.slice(0, 200),
    })),
    healthScore,
    grade: heartbeat?.grade ?? gradeFromScore(healthScore),
  };

  return {
    at: new Date().toISOString(),
    ...base,
    summary: buildSummary(base),
  };
}

/** Blok konteks untuk system prompt — snapshot terakhir (bukan live). */
export async function buildCachedAwarenessContextBlock(): Promise<string> {
  const snapshot = await collectSystemAwareness({ live: false });
  const recentTasks = await listRecentAgentTasks(5);
  const taskLines = recentTasks
    .filter((t) => t.status === "queued" || t.status === "running")
    .map((t) => summarizeTaskForChat(t))
    .slice(0, 3);

  let block = formatAwarenessContextBlock(snapshot);
  if (taskLines.length > 0) {
    block +=
      "\n\nAntrian worker aktif:\n" +
      taskLines
        .map((t) => `- [${t.status}] ${t.title} (${t.shortId})`)
        .join("\n");
  }
  block +=
    "\n\nUntuk minta worker jalankan scan/cek log/deploy: tool `agentWork` action=dispatch. Lacak progress: agentWork action=status.";
  return block;
}

export function formatAwarenessContextBlock(
  snapshot: SystemAwarenessSnapshot
): string {
  const lines = [
    "## Kesadaran sistem VANDOR (kamu = agent ini)",
    "Ini BUKAN sistem lain — ini diri operasionalmu: worker OODA, metrik VPS, heartbeat.",
    `Snapshot: ${snapshot.at} · Skor ${snapshot.healthScore}/100 (${snapshot.grade})`,
    `Worker: mode=${snapshot.agent.mode} tick=#${snapshot.agent.tickCount} ${snapshot.agent.heartbeatStale ? "⚠ stale" : "online"}`,
    snapshot.heartbeat?.summary
      ? `Ringkasan terakhir: ${snapshot.heartbeat.summary}`
      : null,
    snapshot.metrics
      ? `Metrik: CPU ${snapshot.metrics.cpuPct}% · RAM ${snapshot.metrics.memUsedPct}% · Disk ${snapshot.metrics.diskUsedPct ?? "?"}%`
      : null,
    snapshot.issues.length > 0
      ? `Isu: ${snapshot.issues
          .map((i) => i.title)
          .slice(0, 4)
          .join("; ")}`
      : "Isu: tidak ada yang tercatat",
    snapshot.pendingApprovals > 0
      ? `Approval menunggu: ${snapshot.pendingApprovals}`
      : null,
    "",
    "ATURAN: Jika user tanya aman/status/server/operator — WAJIB panggil tool `checkSystem` (live) dulu. Jangan tebak dari snapshot ini saja.",
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatAwarenessForUser(
  snapshot: SystemAwarenessSnapshot
): string {
  const lines = [
    `Skor kesehatan: ${snapshot.healthScore}/100 (${snapshot.grade})`,
    `Mode agent: ${snapshot.agent.mode}${snapshot.agent.killSwitch ? " · KILL SWITCH" : ""}`,
    `Worker: ${snapshot.agent.heartbeatStale ? "offline/stale" : "online"} · tick #${snapshot.agent.tickCount}`,
  ];
  if (snapshot.metrics) {
    lines.push(
      `CPU ${snapshot.metrics.cpuPct}% · RAM ${snapshot.metrics.memUsedPct}% · Disk ${snapshot.metrics.diskUsedPct ?? "?"}%`
    );
  }
  const down = snapshot.services.filter((s) => !s.healthy);
  if (snapshot.services.length > 0) {
    lines.push(
      `Service: ${snapshot.services.length - down.length}/${snapshot.services.length} sehat` +
        (down.length ? ` (${down.map((s) => s.name).join(", ")} down)` : "")
    );
  }
  if (snapshot.uptimeDown > 0) {
    lines.push(`Uptime check gagal: ${snapshot.uptimeDown} target`);
  }
  if (snapshot.issues.length > 0) {
    lines.push(
      `Isu aktif (${snapshot.issues.length}): ${snapshot.issues
        .slice(0, 5)
        .map((i) => `[${i.severity}] ${i.title}`)
        .join("; ")}`
    );
  } else {
    lines.push("Tidak ada isu kritis terdeteksi saat pengecekan.");
  }
  if (snapshot.pendingApprovals > 0) {
    lines.push(`Approval menunggu: ${snapshot.pendingApprovals}`);
  }
  return lines.join("\n");
}
