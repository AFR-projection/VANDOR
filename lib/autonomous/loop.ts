import { autonomousConfig } from "./config";
import { emitEvent } from "./events";
import {
  autoFixIssues,
  type AutoFixResult,
} from "./auto-fix";
import {
  executeApprovedRemediations,
  processTaskQueue,
} from "./executor";
import { detectIssues, type ObservationBundle } from "./healing/detectors";
import { handleIssues } from "./healing/remediations";
import { recordEnhancedHeartbeat } from "./heartbeat";
import { createLogger } from "./logger";
import { scanLogs } from "./logs";
import { collectMetrics } from "./metrics";
import { assessSystem } from "./planner";
import { planAndActFromAssessment } from "./planner-act";
import { processActiveGoals } from "./planner-goals";
import { expireOldApprovals } from "./permission";
import { maybeNotifyPendingApprovals } from "./approval-notify";
import { runProactiveOutreach } from "./proactive-outreach";
import { ensureDefaultRules } from "./rules";
import { ensureDefaultSchedules, runDueSchedules } from "./schedules";
import { scheduleRemoteChecksIfConfigured } from "./remote-hosts";
import { collectServiceHealth } from "./services";
import { resolveOwnerUserId } from "./owner";
import { getAgentState, recordHeartbeat } from "./state";
import { persistMetrics, registerMonitorTools } from "./tools/monitor";
import { registerBuiltinTools } from "./tools";
import { registerShellTools } from "./tools/shell";
import type { ToolContext } from "./types";
import { checkUrls } from "./uptime";

const log = createLogger("loop");

let bootstrapped = false;
let tickCounter = 0;

async function bootstrap(): Promise<void> {
  if (bootstrapped) {
    return;
  }
  registerBuiltinTools();
  registerMonitorTools();
  registerShellTools();
  await ensureDefaultSchedules();
  await ensureDefaultRules();
  bootstrapped = true;
  log.info("Bootstrap selesai — tools & schedules siap.");
}

async function observe(): Promise<ObservationBundle> {
  const [metrics, services, uptime, logs] = await Promise.all([
    collectMetrics(),
    collectServiceHealth(),
    checkUrls(autonomousConfig.uptimeTargets),
    scanLogs(autonomousConfig.logPaths),
  ]);
  return { metrics, services, uptime, logs };
}

export async function runTick(): Promise<void> {
  const tickStartedAt = Date.now();
  const state = await getAgentState();

  if (state.killSwitch) {
    log.warn("Kill switch AKTIF — semua aksi dilewati.");
    await recordHeartbeat("kill-switch");
    return;
  }

  await bootstrap();
  tickCounter += 1;
  const autonomous = state.mode === "autonomous";
  const ownerUserId = await resolveOwnerUserId();
  const ctx: ToolContext = { logger: log, ownerUserId, autonomous };

  await expireOldApprovals();
  await maybeNotifyPendingApprovals();

  const obs = await observe();
  if (
    tickCounter === 1 ||
    tickCounter % autonomousConfig.metricEveryTicks === 0
  ) {
    await persistMetrics(obs.metrics);
  }

  const issues = detectIssues(obs);
  const assessment = await assessSystem({
    metrics: obs.metrics,
    services: obs.services,
    issues,
  });

  const servicesDown = obs.services.filter((s) => !s.healthy).length;
  log.info(
    `tick#${tickCounter} mode=${state.mode} cpu=${obs.metrics.cpuPct}% mem=${obs.metrics.memUsedPct}% disk=${obs.metrics.diskUsedPct ?? "?"}% svcDown=${servicesDown} issues=${issues.length}${assessment ? ` llm=${assessment.status}` : ""}`
  );

  let autoFix: AutoFixResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    details: [],
  };
  if (issues.length > 0) {
    autoFix = await autoFixIssues(issues, autonomous);
    if (autoFix.attempted > 0) {
      log.info(`auto-fix: ${autoFix.succeeded}/${autoFix.attempted} berhasil`);
    }
  }

  let remediation = { approvalsCreated: 0, notified: 0 };
  if (issues.length > 0) {
    remediation = await handleIssues(issues, { autonomous, autoFix });
  }

  let plannedSteps = 0;
  if (assessment) {
    plannedSteps = await planAndActFromAssessment({ assessment, issues });
  }

  let goalTasks = 0;
  if (tickCounter === 1 || tickCounter % 10 === 0) {
    goalTasks = await processActiveGoals(2);
    await scheduleRemoteChecksIfConfigured();
  }

  const scheduled = await runDueSchedules();
  const tasksDone = await processTaskQueue(ctx);
  const executed = await executeApprovedRemediations();

  if (
    issues.length > 0 ||
    executed > 0 ||
    scheduled > 0 ||
    plannedSteps > 0 ||
    goalTasks > 0 ||
    autoFix.attempted > 0
  ) {
    await emitEvent({
      type: "tick-summary",
      severity: issues.some((i) => i.severity === "critical")
        ? "critical"
        : issues.length > 0
          ? "warn"
          : "info",
      source: "loop",
      message:
        assessment?.summary ??
        `Tick#${tickCounter}: ${issues.length} isu, ${autoFix.succeeded} auto-fix, ${remediation.approvalsCreated} approval, ${executed} remediasi, ${tasksDone} task.`,
      payload: {
        issues: issues.map((i) => i.key),
        autoFix,
        recommendations: assessment?.recommendations ?? [],
        scheduled,
        plannedSteps,
        goalTasks,
      },
    });
  }

  const status =
    autoFix.succeeded > 0 && autoFix.failed === 0 && issues.length > 0
      ? "recovering"
      : issues.length === 0
        ? "healthy"
        : "issues-detected";

  const heartbeat = await recordEnhancedHeartbeat({
    mode: state.mode,
    obs,
    issues,
    tickStartedAt,
    status,
    autoFix:
      autoFix.attempted > 0
        ? {
            ran: true,
            success: autoFix.failed === 0,
            summary: `${autoFix.succeeded}/${autoFix.attempted} auto-fix`,
          }
        : undefined,
  });

  await runProactiveOutreach({
    obs,
    issues,
    heartbeat,
    autonomous,
  });
}
