import type { AgentTask } from "@/lib/db/schema";
import { recordAgentAction } from "./audit";
import { runCodeAutoFixPipeline } from "./auto-fix";
import { notifyChatTaskOutcome } from "./chat-task-notify";
import { runStatusSnapshot } from "./cli/runner";
import { runCodeScan } from "./coding-agent/scan";
import { autonomousConfig } from "./config";
import {
  buildDeployApprovalSummary,
  buildDeployCommands,
  buildRollbackCommand,
} from "./deploy";
import { emitEvent } from "./events";
import { scanLogs } from "./logs";
import { collectMetrics } from "./metrics";
import { notify } from "./notify";
import {
  createApproval,
  listApprovedPendingExecution,
  markApprovalConsumed,
} from "./permission";
import { runRemoteHealthChecks } from "./remote-hosts";
import { collectServiceHealth } from "./services";
import {
  claimReadyTasks,
  completeTask,
  failTask,
  markTaskRunning,
  setTaskAwaitingApproval,
} from "./tasks";
import { runTool } from "./tools";
import { execApprovedCommand } from "./tools/shell";
import type { ToolContext } from "./types";
import { checkUrls } from "./uptime";

async function runDeploySteps(_ctx: ToolContext): Promise<DeployStepResult> {
  const commands = buildDeployCommands();
  const steps: DeployStepResult["steps"] = [];
  let previousCommit = "";

  for (const command of commands) {
    const result = await execApprovedCommand(command);
    if (command.includes("git rev-parse") && result.ok && result.data) {
      previousCommit = String(result.data).trim().slice(0, 40);
    }
    steps.push({
      command,
      ok: result.ok,
      output: result.data ? String(result.data).slice(0, 500) : undefined,
      error: result.error,
    });
    if (!result.ok) {
      return {
        ok: false,
        steps,
        rollbackHint: previousCommit
          ? buildRollbackCommand(previousCommit)
          : undefined,
      };
    }
  }

  await notify({
    title: "Deploy selesai",
    body: `VANDOR berhasil di-deploy dari ${autonomousConfig.deployPath}`,
    level: "info",
  });

  return { ok: true, steps };
}

type DeployStepResult = {
  ok: boolean;
  steps: Array<{
    command: string;
    ok: boolean;
    output?: string;
    error?: string;
  }>;
  rollbackHint?: string;
};

async function runTaskByType(
  task: AgentTask,
  ctx: ToolContext
): Promise<unknown> {
  switch (task.type) {
    case "uptime_check": {
      const results = await checkUrls(autonomousConfig.uptimeTargets);
      const down = results.filter((r) => !r.up);
      if (down.length > 0) {
        await emitEvent({
          type: "uptime",
          severity: "error",
          source: "scheduler",
          message: `Endpoint DOWN: ${down.map((d) => d.url).join(", ")}`,
          payload: down,
        });
      }
      return results;
    }
    case "log_scan": {
      const scans = await scanLogs(autonomousConfig.logPaths);
      const total = scans.reduce((a, s) => a + s.errorCount, 0);
      return { totalErrors: total };
    }
    case "daily_report": {
      const [metrics, services] = await Promise.all([
        collectMetrics(),
        collectServiceHealth(),
      ]);
      const down = services.filter((s) => !s.healthy);
      await notify({
        title: "Laporan Harian Sistem",
        body:
          `CPU ${metrics.cpuPct}% · RAM ${metrics.memUsedPct}% · Disk ${metrics.diskUsedPct ?? "?"}%\n` +
          `Uptime ${Math.round(metrics.uptimeSec / 3600)} jam\n` +
          `Service: ${services.length - down.length}/${services.length} sehat` +
          (down.length
            ? `\nBermasalah: ${down.map((s) => s.name).join(", ")}`
            : ""),
        level: "info",
      });
      return { metrics, servicesDown: down.length };
    }
    case "shell": {
      const command = String(
        (task.payload as { command?: string })?.command ?? ""
      );
      return runTool("shell.run", { command }, ctx);
    }
    case "monitor":
      return runTool("monitor.metrics", {}, ctx);
    case "remote_health": {
      const down = await runRemoteHealthChecks();
      return { hostsChecked: true, down };
    }
    case "code_scan": {
      const payload = (task.payload ?? {}) as {
        fullBuild?: boolean;
        includeUltracite?: boolean;
      };
      const fullBuild = Boolean(payload.fullBuild);
      const scan = await runCodeScan({
        taskId: task.id,
        fullBuild,
        includeUltracite: Boolean(payload.includeUltracite),
        echo: false,
      });
      await recordAgentAction({
        taskId: task.id,
        tool: "coding-agent",
        action: "code_scan",
        input: { fullBuild },
        output: { sessionId: scan.sessionId, steps: scan.steps.length },
        status: scan.ok ? "ok" : "error",
        riskLevel: "safe",
        reason: scan.summary,
      });
      if (!scan.ok) {
        await emitEvent({
          type: "code_scan_failed",
          severity: "error",
          source: "coding-agent",
          message: scan.summary,
          payload: { sessionId: scan.sessionId, steps: scan.steps },
        });
        const scanPayload = (task.payload ?? {}) as {
          autoFix?: boolean;
          requestedBy?: string;
        };
        const fromChat = scanPayload.requestedBy === "chat";
        const shouldAutoFix =
          autonomousConfig.autoFixEnabled &&
          (scanPayload.autoFix === true ||
            (!fromChat && autonomousConfig.scheduledCodeScanAutoFix));

        if (shouldAutoFix) {
          const fix = await runCodeAutoFixPipeline({
            taskId: task.id,
            fullBuild,
          });
          return { scan, autoFix: fix };
        }
        await notify({
          title: "VANDOR",
          body: `${scan.summary}\n\nLihat Terminal di Operator (session ${scan.sessionId.slice(0, 8)}).`,
          level: "error",
          cooldownMs: autonomousConfig.codeFixNotifyCooldownMs,
          cooldownKey: "code-scan-failed",
        });
      }
      return scan;
    }
    case "code_fix":
    case "code_fix_auto": {
      const fullBuild = Boolean(
        (task.payload as { fullBuild?: boolean })?.fullBuild
      );
      const fix = await runCodeAutoFixPipeline({
        taskId: task.id,
        fullBuild,
      });
      await recordAgentAction({
        taskId: task.id,
        tool: "coding-agent",
        action: task.type,
        output: fix,
        status: fix.ok ? "ok" : "error",
        riskLevel: "moderate",
        reason: fix.diagnosis.slice(0, 500),
      });
      return fix;
    }
    case "vps_status": {
      const snap = await runStatusSnapshot({ taskId: task.id, echo: false });
      return { sessionId: snap.sessionId, ok: snap.ok };
    }
    case "deploy": {
      const payload = task.payload as { approved?: boolean } | null;
      if (!payload?.approved) {
        const { id, deduped } = await createApproval({
          taskId: task.id,
          actionType: "deploy",
          summary: buildDeployApprovalSummary(),
          payload: {
            taskId: task.id,
            commands: buildDeployCommands(),
          },
          riskLevel: "dangerous",
        });
        if (!deduped) {
          await notify({
            title: "Deploy menunggu approval",
            body: `${buildDeployApprovalSummary()}\n\nSetujui di Operator atau balas SETUJU di WhatsApp.`,
            level: "warn",
          });
        }
        await setTaskAwaitingApproval(task.id);
        return { awaitingApproval: true, approvalId: id };
      }
      return runDeploySteps(ctx);
    }
    default:
      throw new Error(`Tipe task tidak dikenal: ${task.type}`);
  }
}

/** Proses antrian task siap jalan (dibatasi maxTasksPerTick). */
export async function processTaskQueue(ctx: ToolContext): Promise<number> {
  const tasks = await claimReadyTasks(autonomousConfig.maxTasksPerTick);
  let processed = 0;

  for (const task of tasks) {
    await markTaskRunning(task.id);
    try {
      const result = await runTaskByType(task, ctx);
      await completeTask(task.id, result);
      await notifyChatTaskOutcome({
        task: {
          ...task,
          status: "done",
          result: result as never,
          finishedAt: new Date(),
        },
        outcome: "done",
        result,
      });
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failTask(task.id, message);
      await notifyChatTaskOutcome({
        task: {
          ...task,
          status: "failed",
          error: message,
          finishedAt: new Date(),
        },
        outcome: "failed",
        error: message,
      });
      await recordAgentAction({
        taskId: task.id,
        tool: "executor",
        action: task.type,
        status: "error",
        riskLevel: "safe",
        reason: message,
      });
    }
  }
  return processed;
}

/**
 * Jalankan remediasi yang SUDAH disetujui owner. Tetap lewat blocklist keras.
 */
export async function executeApprovedRemediations(): Promise<number> {
  const approved = await listApprovedPendingExecution(5);
  let executed = 0;

  for (const approval of approved) {
    const payload = approval.payload as { command?: string } | null;
    const command = payload?.command;
    if (!command) {
      await markApprovalConsumed(approval.id);
      continue;
    }

    const started = Date.now();
    const result = await execApprovedCommand(command);
    await recordAgentAction({
      taskId: approval.taskId,
      tool: "shell",
      action: "approved-remediation",
      input: { command },
      output: result.data,
      status: result.ok ? "ok" : "error",
      riskLevel: approval.riskLevel,
      reason: result.error ?? approval.summary,
      durationMs: Date.now() - started,
    });
    await markApprovalConsumed(approval.id);
    await notify({
      title: result.ok ? "Remediasi berhasil" : "Remediasi gagal",
      body: `\`${command}\`\n\n${result.ok ? "Selesai dijalankan." : `Gagal: ${result.error}`}`,
      level: result.ok ? "info" : "error",
    });
    executed += 1;
  }

  return executed;
}
