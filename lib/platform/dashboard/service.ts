import { and, asc, desc, eq, gt, inArray, type SQL } from "drizzle-orm";
import {
  type PlatformWorkflowRun,
  type PlatformWorkflowStep,
  platformEvent,
  platformWorkflowRun,
} from "@/lib/db/schema";
import { isPlatformV2Enabled } from "../config";
import { listAgents } from "../core/agent-registry";
import { getPlatformDb } from "../db";
import { listEventsForRun } from "../events/bus";
import { countActiveWorkflowRuns } from "../queue/claim-runs";
import { listStepsForRun } from "../queue/queries";
import {
  ACTIVE_RUN_STATUSES,
  formatTimeAgo,
  isActiveRunStatus,
} from "./format";

export type WorkflowRunFilter = "active" | "completed" | "failed" | "all";

export type WorkflowRunListItem = {
  id: string;
  shortId: string;
  status: string;
  inputSummary: string | null;
  outputSummary: string | null;
  chatId: string | null;
  stepCount: number;
  completedSteps: number;
  currentAgent: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  isActive: boolean;
  ageLabel: string;
};

export type WorkflowStepView = {
  id: string;
  stepKey: string;
  agentId: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  sortOrder: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type WorkflowEventView = {
  id: string;
  topic: string;
  runId: string | null;
  stepId: string | null;
  agentId: string | null;
  payload: unknown;
  createdAt: string;
};

export type WorkflowRunDetail = {
  run: WorkflowRunListItem;
  planSummary: string | null;
  steps: WorkflowStepView[];
  events: WorkflowEventView[];
};

export type PlatformDashboardSnapshot = {
  enabled: boolean;
  activeRunsGlobal: number;
  activeRunsUser: number;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    toolCount: number;
    memoryScopes: string[];
  }>;
};

function toRunListItem(
  run: PlatformWorkflowRun,
  steps: PlatformWorkflowStep[]
): WorkflowRunListItem {
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const running = steps.find(
    (s) =>
      s.status === "running" || s.status === "queued" || s.status === "waiting"
  );
  const plan = run.planJson as { summary?: string } | null;

  return {
    id: run.id,
    shortId: run.id.slice(0, 8),
    status: run.status,
    inputSummary: run.inputSummary ?? plan?.summary ?? null,
    outputSummary: run.outputSummary,
    chatId: run.chatId,
    stepCount: steps.length,
    completedSteps,
    currentAgent: running?.agentId ?? null,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    error: run.error,
    isActive: isActiveRunStatus(run.status),
    ageLabel: formatTimeAgo(run.createdAt),
  };
}

function toStepView(step: PlatformWorkflowStep): WorkflowStepView {
  return {
    id: step.id,
    stepKey: step.stepKey,
    agentId: step.agentId,
    status: step.status,
    attempt: step.attempt,
    maxAttempts: step.maxAttempts,
    sortOrder: step.sortOrder,
    error: step.error,
    startedAt: step.startedAt?.toISOString() ?? null,
    completedAt: step.completedAt?.toISOString() ?? null,
  };
}

function toEventView(
  event: typeof platformEvent.$inferSelect
): WorkflowEventView {
  return {
    id: event.id,
    topic: event.topic,
    runId: event.runId,
    stepId: event.stepId,
    agentId: event.agentId,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}

export async function getPlatformDashboardSnapshot(
  userId: string
): Promise<PlatformDashboardSnapshot> {
  const enabled = isPlatformV2Enabled();
  const activeRunsUser = enabled
    ? (await listWorkflowRunsForUser(userId, { status: "active", limit: 50 }))
        .length
    : 0;

  return {
    enabled,
    activeRunsGlobal: enabled ? await countActiveWorkflowRuns() : 0,
    activeRunsUser,
    agents: enabled
      ? listAgents().map((a) => ({
          id: a.id,
          name: a.name,
          status: a.runtimeStatus,
          toolCount: a.tools.length,
          memoryScopes: a.memoryScopes,
        }))
      : [],
  };
}

export async function listWorkflowRunsForUser(
  userId: string,
  input: { status?: WorkflowRunFilter; limit?: number } = {}
): Promise<WorkflowRunListItem[]> {
  const db = getPlatformDb();
  const limit = input.limit ?? 20;
  const status = input.status ?? "all";

  let statusFilter: SQL | undefined;
  if (status === "active") {
    statusFilter = inArray(platformWorkflowRun.status, ACTIVE_RUN_STATUSES);
  } else if (status === "completed") {
    statusFilter = eq(platformWorkflowRun.status, "completed");
  } else if (status === "failed") {
    statusFilter = inArray(platformWorkflowRun.status, ["failed", "cancelled"]);
  }

  const runs = await db
    .select()
    .from(platformWorkflowRun)
    .where(
      statusFilter
        ? and(eq(platformWorkflowRun.userId, userId), statusFilter)
        : eq(platformWorkflowRun.userId, userId)
    )
    .orderBy(desc(platformWorkflowRun.createdAt))
    .limit(limit);

  const items: WorkflowRunListItem[] = [];
  for (const run of runs) {
    const steps = await listStepsForRun(run.id);
    items.push(toRunListItem(run, steps));
  }
  return items;
}

export async function getWorkflowRunDetailForUser(
  userId: string,
  runId: string
): Promise<WorkflowRunDetail | null> {
  const db = getPlatformDb();
  const rows = await db
    .select()
    .from(platformWorkflowRun)
    .where(
      and(
        eq(platformWorkflowRun.id, runId),
        eq(platformWorkflowRun.userId, userId)
      )
    )
    .limit(1);

  const run = rows[0];
  if (!run) {
    return null;
  }

  const steps = await listStepsForRun(runId);
  const events = await listEventsForRun(runId, 80);
  const plan = run.planJson as { summary?: string } | null;

  return {
    run: toRunListItem(run, steps),
    planSummary: plan?.summary ?? run.inputSummary,
    steps: steps.map(toStepView),
    events: events.map(toEventView).reverse(),
  };
}

export async function pollPlatformEventsForUser(
  userId: string,
  afterCreatedAt: Date,
  limit = 40
): Promise<WorkflowEventView[]> {
  const db = getPlatformDb();
  const recentRuns = await db
    .select({ id: platformWorkflowRun.id })
    .from(platformWorkflowRun)
    .where(eq(platformWorkflowRun.userId, userId))
    .orderBy(desc(platformWorkflowRun.createdAt))
    .limit(100);

  const runIds = recentRuns.map((r) => r.id);
  if (runIds.length === 0) {
    return [];
  }

  const events = await db
    .select()
    .from(platformEvent)
    .where(
      and(
        inArray(platformEvent.runId, runIds),
        gt(platformEvent.createdAt, afterCreatedAt)
      )
    )
    .orderBy(asc(platformEvent.createdAt))
    .limit(limit);

  return events.map(toEventView);
}

export async function listRecentEventsForUser(
  userId: string,
  limit = 30
): Promise<WorkflowEventView[]> {
  const db = getPlatformDb();
  const recentRuns = await db
    .select({ id: platformWorkflowRun.id })
    .from(platformWorkflowRun)
    .where(eq(platformWorkflowRun.userId, userId))
    .orderBy(desc(platformWorkflowRun.createdAt))
    .limit(50);

  const runIds = recentRuns.map((r) => r.id);
  if (runIds.length === 0) {
    return [];
  }

  const events = await db
    .select()
    .from(platformEvent)
    .where(inArray(platformEvent.runId, runIds))
    .orderBy(desc(platformEvent.createdAt))
    .limit(limit);

  return events.map(toEventView);
}
