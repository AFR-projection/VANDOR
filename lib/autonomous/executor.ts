import { recordAgentAction } from "./audit";
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
import { execApprovedCommand } from "./tools/shell";
import { runTool } from "./tools";
import type { AgentTask } from "@/lib/db/schema";
import type { ToolContext } from "./types";
import { checkUrls } from "./uptime";

async function runDeploySteps(_ctx: ToolContext): Promise<DeployStepResult> {
  const commands = buildDeployCommands();
  const steps: DeployStepResult["steps"] = [];
  let previousCommit = "";

  for (const command of commands) {
    // biome-ignore lint/nursery/noAwaitInLoop: deploy berurutan
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
          (down.length ? `\nBermasalah: ${down.map((s) => s.name).join(", ")}` : ""),
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
    // biome-ignore lint/nursery/noAwaitInLoop: task harus berurutan, dibatasi kecil
    await markTaskRunning(task.id);
    try {
      // biome-ignore lint/nursery/noAwaitInLoop: eksekusi task berurutan
      const result = await runTaskByType(task, ctx);
      // biome-ignore lint/nursery/noAwaitInLoop: update status berurutan
      await completeTask(task.id, result);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // biome-ignore lint/nursery/noAwaitInLoop: update status berurutan
      await failTask(task.id, message);
      // biome-ignore lint/nursery/noAwaitInLoop: audit berurutan
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
      // biome-ignore lint/nursery/noAwaitInLoop: jumlah kecil, berurutan
      await markApprovalConsumed(approval.id);
      continue;
    }

    const started = Date.now();
    // biome-ignore lint/nursery/noAwaitInLoop: eksekusi berurutan demi keamanan
    const result = await execApprovedCommand(command);
    // biome-ignore lint/nursery/noAwaitInLoop: audit berurutan
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
    // biome-ignore lint/nursery/noAwaitInLoop: berurutan
    await markApprovalConsumed(approval.id);
    // biome-ignore lint/nursery/noAwaitInLoop: notifikasi berurutan
    await notify({
      title: result.ok ? "Remediasi berhasil" : "Remediasi gagal",
      body: `\`${command}\`\n\n${result.ok ? "Selesai dijalankan." : `Gagal: ${result.error}`}`,
      level: result.ok ? "info" : "error",
    });
    executed += 1;
  }

  return executed;
}
