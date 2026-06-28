import { autonomousConfig } from "./config";
import { emitEvent } from "./events";
import {
  executeApprovedRemediations,
  processTaskQueue,
} from "./executor";
import { detectIssues, type ObservationBundle } from "./healing/detectors";
import { handleIssues } from "./healing/remediations";
import { createLogger } from "./logger";
import { scanLogs } from "./logs";
import { collectMetrics } from "./metrics";
import { assessSystem } from "./planner";
import { planAndActFromAssessment } from "./planner-act";
import { processActiveGoals } from "./planner-goals";
import { expireOldApprovals } from "./permission";
import { maybeNotifyPendingApprovals } from "./approval-notify";
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

/** OBSERVE: kumpulkan seluruh sinyal sistem secara paralel. */
async function observe(): Promise<ObservationBundle> {
  const [metrics, services, uptime, logs] = await Promise.all([
    collectMetrics(),
    collectServiceHealth(),
    checkUrls(autonomousConfig.uptimeTargets),
    scanLogs(autonomousConfig.logPaths),
  ]);
  return { metrics, services, uptime, logs };
}

/** Satu siklus OODA lengkap. */
export async function runTick(): Promise<void> {
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

  // 1. OBSERVE
  const obs = await observe();
  if (
    tickCounter === 1 ||
    tickCounter % autonomousConfig.metricEveryTicks === 0
  ) {
    await persistMetrics(obs.metrics);
  }

  // 2. ANALYZE (heuristik) + penilaian LLM opsional
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

  // 3. PLAN + ACT untuk isu (konservatif: approval + notifikasi)
  let remediation = { approvalsCreated: 0, notified: 0 };
  if (issues.length > 0) {
    remediation = await handleIssues(issues);
  }

  // 3b. Planner→Act dari penilaian LLM (task observasi aman)
  let plannedSteps = 0;
  if (assessment) {
    plannedSteps = await planAndActFromAssessment({ assessment, issues });
  }

  // 3c. Goal planning — pecah goal aktif jadi task (setiap 10 tick)
  let goalTasks = 0;
  if (tickCounter === 1 || tickCounter % 10 === 0) {
    goalTasks = await processActiveGoals(2);
    await scheduleRemoteChecksIfConfigured();
  }

  // 4. ACT: scheduler → task queue → remediasi yang sudah disetujui
  const scheduled = await runDueSchedules();
  const tasksDone = await processTaskQueue(ctx);
  const executed = await executeApprovedRemediations();

  // 5. EVALUATE + LEARN
  if (issues.length > 0 || executed > 0 || scheduled > 0 || plannedSteps > 0 || goalTasks > 0) {
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
        `Tick#${tickCounter}: ${issues.length} isu, ${remediation.approvalsCreated} approval baru, ${executed} remediasi dijalankan, ${tasksDone} task selesai.`,
      payload: {
        issues: issues.map((i) => i.key),
        recommendations: assessment?.recommendations ?? [],
        scheduled,
        plannedSteps,
        goalTasks,
      },
    });
  }

  await recordHeartbeat(issues.length === 0 ? "healthy" : "issues-detected");
}
