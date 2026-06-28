import { eq } from "drizzle-orm";
import { agentSchedule } from "@/lib/db/schema";
import { isCronDue } from "./cron";
import { db } from "./db";
import { enqueueTask } from "./tasks";

const DEFAULT_SCHEDULES = [
  {
    name: "uptime-check",
    kind: "interval" as const,
    expression: "120",
    taskType: "uptime_check",
  },
  {
    name: "log-scan",
    kind: "interval" as const,
    expression: "300",
    taskType: "log_scan",
  },
  {
    name: "daily-report",
    kind: "interval" as const,
    expression: "86400",
    taskType: "daily_report",
  },
  {
    name: "code-scan",
    kind: "interval" as const,
    expression: "3600",
    taskType: "code_scan",
  },
  {
    name: "vps-status",
    kind: "interval" as const,
    expression: "600",
    taskType: "vps_status",
  },
];

/** Pastikan jadwal default ada (idempoten). */
export async function ensureDefaultSchedules(): Promise<void> {
  const existing = await db
    .select({ name: agentSchedule.name })
    .from(agentSchedule);
  const have = new Set(existing.map((r) => r.name));
  const missing = DEFAULT_SCHEDULES.filter((s) => !have.has(s.name));
  if (missing.length === 0) {
    return;
  }
  await db.insert(agentSchedule).values(missing);
}

function isDue(
  kind: string,
  expression: string,
  lastRunAt: Date | null
): boolean {
  if (kind === "cron") {
    return isCronDue(expression, lastRunAt);
  }
  if (kind !== "interval") {
    return false;
  }
  const seconds = Number.parseInt(expression, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return false;
  }
  if (!lastRunAt) {
    return true;
  }
  return Date.now() - lastRunAt.getTime() >= seconds * 1000;
}

/** Cek jadwal yang due, enqueue task-nya, update lastRunAt. */
export async function runDueSchedules(): Promise<number> {
  const schedules = await db
    .select()
    .from(agentSchedule)
    .where(eq(agentSchedule.enabled, true));

  let triggered = 0;
  const due = schedules.filter((s) =>
    isDue(s.kind, s.expression, s.lastRunAt)
  );

  await Promise.all(
    due.map(async (s) => {
      await enqueueTask({
        type: s.taskType,
        title: `Scheduled: ${s.name}`,
        payload: s.payload ?? null,
        priority: 4,
        dedupe: true,
      });
      await db
        .update(agentSchedule)
        .set({ lastRunAt: new Date(), updatedAt: new Date() })
        .where(eq(agentSchedule.id, s.id));
      triggered += 1;
    })
  );

  return triggered;
}
