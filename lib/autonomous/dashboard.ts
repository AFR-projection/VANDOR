import { desc } from "drizzle-orm";
import {
  agentNotification,
  type AgentMode,
  systemMetric,
} from "@/lib/db/schema";
import { maybeNotifyPendingApprovals } from "./approval-notify";
import { listAgentActions } from "./audit";
import { db } from "./db";
import { listRecentEvents } from "./events";
import { listGoals } from "./goals";
import { listPendingApprovals } from "./permission";
import { listRules } from "./rules";
import { listSchedules } from "./schedules-manage";
import { getAgentState, setKillSwitch, setMode } from "./state";
import { getLatestHeartbeat } from "./heartbeat";
import { listTerminalLogs } from "./terminal-log";
import { listRecentTasks } from "./tasks";

export async function getOverview() {
  const [
    state,
    metricsRows,
    tasks,
    actions,
    approvals,
    events,
    notifications,
    goals,
    rules,
    schedules,
    terminal,
    heartbeat,
  ] = await Promise.all([
    getAgentState(),
    db
      .select()
      .from(systemMetric)
      .orderBy(desc(systemMetric.createdAt))
      .limit(240),
    listRecentTasks(25),
    listAgentActions(40),
    listPendingApprovals(50),
    listRecentEvents(40),
    db
      .select()
      .from(agentNotification)
      .orderBy(desc(agentNotification.createdAt))
      .limit(20),
    listGoals(30),
    listRules(),
    listSchedules(),
    listTerminalLogs({ limit: 120 }),
    getLatestHeartbeat(),
  ]);

  const series = [...metricsRows].reverse();
  const latest = metricsRows[0] ?? null;

  if (approvals.length > 0) {
    void maybeNotifyPendingApprovals().catch(() => {
      /* non-fatal */
    });
  }

  return {
    state,
    heartbeat,
    metrics: { latest, series },
    tasks,
    actions,
    approvals,
    events,
    notifications,
    goals,
    rules,
    schedules,
    terminal: terminal.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      stream: row.stream,
      line: row.line,
      level: row.level,
      command: row.command,
      exitCode: row.exitCode,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
  };
}

export async function controlAgent(input: {
  mode?: AgentMode;
  killSwitch?: boolean;
}): Promise<void> {
  if (input.mode) {
    await setMode(input.mode);
  }
  if (typeof input.killSwitch === "boolean") {
    await setKillSwitch(input.killSwitch);
  }
}
