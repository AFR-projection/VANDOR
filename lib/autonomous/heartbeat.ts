import { eq, sql } from "drizzle-orm";
import { agentState } from "@/lib/db/schema";
import { db } from "./db";
import type { Issue, ObservationBundle } from "./healing/detectors";
import { pingNotifyChannel } from "./notify-ping";
import { getAgentState } from "./state";

export type HeartbeatSubsystemStatus =
  | "ok"
  | "warn"
  | "error"
  | "unknown"
  | "offline";

export type HeartbeatSnapshot = {
  v: 1;
  at: string;
  tick: number;
  mode: string;
  healthScore: number;
  grade: "excellent" | "good" | "degraded" | "critical";
  status: string;
  subsystems: {
    worker: HeartbeatSubsystemStatus;
    web: HeartbeatSubsystemStatus;
    whatsapp: HeartbeatSubsystemStatus;
    database: HeartbeatSubsystemStatus;
  };
  metrics: {
    cpuPct: number;
    memUsedPct: number;
    diskUsedPct: number | null;
    servicesDown: number;
    uptimeDown: number;
  };
  issues: {
    total: number;
    critical: number;
    error: number;
    warn: number;
    keys: string[];
  };
  tickDurationMs: number;
  autoFix: {
    lastAt: string | null;
    lastSuccess: boolean | null;
    lastSummary: string | null;
  };
  proactive: {
    lastCheckInAt: string | null;
    lastAlertAt: string | null;
  };
  summary: string;
};

function parseStoredNote(
  note: string | null
): Partial<HeartbeatSnapshot> | null {
  if (!note?.trim().startsWith("{")) {
    return null;
  }
  try {
    return JSON.parse(note) as Partial<HeartbeatSnapshot>;
  } catch {
    return null;
  }
}

function gradeFromScore(score: number): HeartbeatSnapshot["grade"] {
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

function computeHealthScore(obs: ObservationBundle, issues: Issue[]): number {
  let score = 100;
  const { metrics, services, uptime } = obs;

  score -= Math.min(30, Math.floor(metrics.cpuPct / 3));
  score -= Math.min(25, Math.floor(metrics.memUsedPct / 4));
  if (metrics.diskUsedPct != null) {
    score -= Math.min(20, Math.floor(metrics.diskUsedPct / 5));
  }

  const svcDown = services.filter((s) => !s.healthy).length;
  score -= svcDown * 12;

  const upDown = uptime.filter((u) => !u.up).length;
  score -= upDown * 15;

  for (const issue of issues) {
    if (issue.severity === "critical") {
      score -= 15;
    } else if (issue.severity === "error") {
      score -= 8;
    } else {
      score -= 3;
    }
  }

  return Math.max(0, Math.min(100, score));
}

function buildSummary(
  score: number,
  issues: Issue[],
  obs: ObservationBundle
): string {
  if (issues.some((i) => i.severity === "critical")) {
    return `Kritis — ${issues.filter((i) => i.severity === "critical").length} isu butuh tindakan segera`;
  }
  const svcDown = obs.services.filter((s) => !s.healthy).length;
  if (svcDown > 0) {
    return `${svcDown} service bermasalah · skor ${score}`;
  }
  if (issues.length > 0) {
    return `${issues.length} isu terdeteksi · skor ${score}`;
  }
  if (score >= 90) {
    return `Semua sistem sehat · skor ${score}`;
  }
  return `Sistem stabil dengan catatan · skor ${score}`;
}

export type RecordHeartbeatInput = {
  mode: string;
  obs: ObservationBundle;
  issues: Issue[];
  tickStartedAt: number;
  status: string;
  autoFix?: {
    ran: boolean;
    success: boolean;
    summary: string;
  };
};

/** Simpan snapshot heartbeat kaya ke AgentState (note = JSON). */
export async function recordEnhancedHeartbeat(
  input: RecordHeartbeatInput
): Promise<HeartbeatSnapshot> {
  const state = await getAgentState();
  const prev = parseStoredNote(state.note);
  const tick = state.tickCount + 1;

  const [waPing] = await Promise.all([pingNotifyChannel()]);

  const healthScore = computeHealthScore(input.obs, input.issues);
  const critical = input.issues.filter((i) => i.severity === "critical").length;
  const error = input.issues.filter((i) => i.severity === "error").length;
  const warn = input.issues.filter((i) => i.severity === "warn").length;

  const dbHealthy = input.obs.services.some(
    (s) => s.kind === "postgres" && s.healthy
  );
  const dbIssue = input.issues.some((i) => i.key === "db-down");

  const webUp = input.obs.uptime.every((u) => u.up);

  const snapshot: HeartbeatSnapshot = {
    v: 1,
    at: new Date().toISOString(),
    tick,
    mode: input.mode,
    healthScore,
    grade: gradeFromScore(healthScore),
    status: input.status,
    subsystems: {
      worker: "ok",
      web: webUp ? "ok" : "error",
      whatsapp:
        waPing.ok && waPing.whatsappStatus === "connected"
          ? "ok"
          : waPing.ok
            ? "warn"
            : "error",
      database: dbIssue ? "error" : dbHealthy ? "ok" : "unknown",
    },
    metrics: {
      cpuPct: input.obs.metrics.cpuPct,
      memUsedPct: input.obs.metrics.memUsedPct,
      diskUsedPct: input.obs.metrics.diskUsedPct,
      servicesDown: input.obs.services.filter((s) => !s.healthy).length,
      uptimeDown: input.obs.uptime.filter((u) => !u.up).length,
    },
    issues: {
      total: input.issues.length,
      critical,
      error,
      warn,
      keys: input.issues.map((i) => i.key).slice(0, 12),
    },
    tickDurationMs: Date.now() - input.tickStartedAt,
    autoFix: {
      lastAt: input.autoFix?.ran
        ? new Date().toISOString()
        : (prev?.autoFix?.lastAt ?? null),
      lastSuccess: input.autoFix?.ran
        ? input.autoFix.success
        : (prev?.autoFix?.lastSuccess ?? null),
      lastSummary: input.autoFix?.ran
        ? input.autoFix.summary
        : (prev?.autoFix?.lastSummary ?? null),
    },
    proactive: {
      lastCheckInAt: prev?.proactive?.lastCheckInAt ?? null,
      lastAlertAt: prev?.proactive?.lastAlertAt ?? null,
    },
    summary: buildSummary(healthScore, input.issues, input.obs),
  };

  await db
    .update(agentState)
    .set({
      status: input.status,
      lastHeartbeatAt: new Date(),
      lastTickAt: new Date(),
      tickCount: sql`${agentState.tickCount} + 1`,
      note: JSON.stringify(snapshot),
      updatedAt: new Date(),
    })
    .where(eq(agentState.id, "default"));

  return snapshot;
}

/** Baca snapshot heartbeat terakhir dari DB. */
export async function getLatestHeartbeat(): Promise<HeartbeatSnapshot | null> {
  const state = await getAgentState();
  return parseStoredNote(state.note) as HeartbeatSnapshot | null;
}

/** Perbarui bagian proactive pada snapshot (check-in / alert). */
export async function touchProactiveHeartbeat(
  kind: "checkIn" | "alert"
): Promise<void> {
  const state = await getAgentState();
  const prev = parseStoredNote(state.note);
  if (prev?.v !== 1) {
    return;
  }
  const now = new Date().toISOString();
  const next: HeartbeatSnapshot = {
    ...(prev as HeartbeatSnapshot),
    proactive: {
      lastCheckInAt:
        kind === "checkIn" ? now : (prev.proactive?.lastCheckInAt ?? null),
      lastAlertAt:
        kind === "alert" ? now : (prev.proactive?.lastAlertAt ?? null),
    },
  };
  await db
    .update(agentState)
    .set({ note: JSON.stringify(next), updatedAt: new Date() })
    .where(eq(agentState.id, "default"));
}
