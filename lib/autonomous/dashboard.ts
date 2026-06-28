import { desc } from "drizzle-orm";
import {
  agentNotification,
  type AgentMode,
  systemMetric,
} from "@/lib/db/schema";
import { listAgentActions } from "./audit";
import { db } from "./db";
import { listRecentEvents } from "./events";
import { listGoals } from "./goals";
import { listPendingApprovals } from "./permission";
import { listRules } from "./rules";
import { listSchedules } from "./schedules-manage";
import { getAgentState, setKillSwitch, setMode } from "./state";
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
  ]);

  const series = [...metricsRows].reverse();
  const latest = metricsRows[0] ?? null;

  return {
    state,
    metrics: { latest, series },
    tasks,
    actions,
    approvals,
    events,
    notifications,
    goals,
    rules,
    schedules,
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
