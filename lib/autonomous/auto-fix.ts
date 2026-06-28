import { recordAgentAction } from "./audit";
import { autonomousConfig } from "./config";
import { analyzeCodeScan } from "./coding-agent/analyze";
import { runCodeScan } from "./coding-agent/scan";
import { emitEvent } from "./events";
import type { Issue } from "./healing/detectors";
import { createLogger } from "./logger";
import { notify } from "./notify";
import { recordOperatorIncident } from "./operator-memory";
import { resolveOwnerUserId } from "./owner";
import {
  canAutoFixCommand,
  evaluateCommand,
} from "./rule-engine";
import { execApprovedCommand } from "./tools/shell";

const log = createLogger("auto-fix");

export type AutoFixResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  details: Array<{
    issueKey: string;
    command: string;
    ok: boolean;
    error?: string;
  }>;
};

export type CodeAutoFixResult = {
  ok: boolean;
  sessionId: string;
  diagnosis: string;
  commandsRun: string[];
  scanBeforeOk: boolean;
  scanAfterOk: boolean;
};

function autoFixEnabled(autonomous: boolean): boolean {
  if (!autonomousConfig.autoFixEnabled) {
    return false;
  }
  return autonomous || autonomousConfig.autoFixWithoutAutonomousMode;
}

/** Jalankan satu perintah auto-fix dengan guard keamanan. */
export async function runAutoFixCommand(
  command: string,
  context: { issueKey?: string; source: string }
): Promise<{ ok: boolean; error?: string; output?: string }> {
  if (!canAutoFixCommand(command)) {
    return { ok: false, error: "Perintah tidak masuk whitelist auto-fix" };
  }

  const verdict = await evaluateCommand(command);
  if (verdict.decision === "deny") {
    return { ok: false, error: verdict.reason };
  }

  log.info(`Auto-fix [${context.source}] ${command.slice(0, 120)}`);
  const result = await execApprovedCommand(command);
  const stdout = result.data
    ? String(
        (result.data as { stdout?: string }).stdout ?? result.data
      ).slice(0, 800)
    : undefined;

  await recordAgentAction({
    tool: "auto-fix",
    action: context.source,
    input: { command, issueKey: context.issueKey },
    output: { stdout, summary: result.summary },
    status: result.ok ? "ok" : "error",
    riskLevel: "moderate",
    reason: result.error ?? "auto-fix executed",
  });

  return {
    ok: result.ok,
    error: result.error,
    output: stdout,
  };
}

/**
 * Auto-remediasi isu healing — tanpa approval bila mode autonomous + auto-fix aktif.
 * Notifikasi WA dikirim setelah fix berhasil/gagal.
 */
export async function autoFixIssues(
  issues: Issue[],
  autonomous: boolean
): Promise<AutoFixResult> {
  const result: AutoFixResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    details: [],
  };

  if (!autoFixEnabled(autonomous)) {
    return result;
  }

  const ownerUserId = await resolveOwnerUserId();

  for (const issue of issues) {
    const command = issue.remediation?.command?.trim();
    if (!command) {
      continue;
    }
    if (!canAutoFixCommand(command)) {
      continue;
    }

    result.attempted += 1;
    const fix = await runAutoFixCommand(command, {
      issueKey: issue.key,
      source: "healing",
    });

    result.details.push({
      issueKey: issue.key,
      command,
      ok: fix.ok,
      error: fix.error,
    });

    if (fix.ok) {
      result.succeeded += 1;
      await recordOperatorIncident({
        userId: ownerUserId,
        issue,
        outcome: "auto_fixed",
        command,
      });
      await emitEvent({
        type: "auto-fix-success",
        severity: "info",
        source: "auto-fix",
        message: `${issue.title} — diperbaiki otomatis`,
        payload: { issueKey: issue.key, command },
      });
      await notify({
        title: "Auto-fix berhasil",
        body:
          `✅ *${issue.title}*\n\n` +
          `Perintah: \`${command}\`\n\n` +
          `${issue.detail.slice(0, 300)}\n\n` +
          `_VANDOR Operator memperbaiki otomatis — tidak perlu approval._`,
        level: "info",
      });
    } else {
      result.failed += 1;
      await recordOperatorIncident({
        userId: ownerUserId,
        issue,
        outcome: "auto_fix_failed",
        command,
      });
      await notify({
        title: "Auto-fix gagal",
        body:
          `❌ *${issue.title}*\n\n` +
          `Perintah: \`${command}\`\n` +
          `Error: ${fix.error ?? "unknown"}\n\n` +
          `Perlu tindakan manual atau cek Operator.`,
        level: "error",
      });
    }
  }

  return result;
}

const BUILTIN_CODE_FIX_COMMANDS = [
  "npm run fix",
  "npx ultracite fix",
];

/**
 * Pipeline auto-fix codebase: scan → fix builtin → LLM commands → rescan.
 * Tanpa approval; alert WA owner setelah sukses.
 */
export async function runCodeAutoFixPipeline(options?: {
  taskId?: string;
  fullBuild?: boolean;
}): Promise<CodeAutoFixResult> {
  const scanBefore = await runCodeScan({
    taskId: options?.taskId,
    fullBuild: false,
    echo: false,
  });

  if (scanBefore.ok) {
    return {
      ok: true,
      sessionId: scanBefore.sessionId,
      diagnosis: "Codebase sudah bersih — tidak ada yang perlu diperbaiki.",
      commandsRun: [],
      scanBeforeOk: true,
      scanAfterOk: true,
    };
  }

  const commandsRun: string[] = [];

  for (const command of BUILTIN_CODE_FIX_COMMANDS) {
    const fix = await runAutoFixCommand(command, { source: "code-builtin" });
    commandsRun.push(command);
    if (fix.ok) {
      const rescan = await runCodeScan({
        sessionId: scanBefore.sessionId,
        fullBuild: false,
        echo: false,
      });
      if (rescan.ok) {
        await notify({
          title: "Code auto-fix berhasil",
          body:
            `✅ Error codebase diperbaiki otomatis.\n\n` +
            `Perintah: \`${command}\`\n` +
            `Session: ${scanBefore.sessionId.slice(0, 8)}\n\n` +
            `_Scan ulang lulus — tidak perlu approval._`,
          level: "info",
        });
        return {
          ok: true,
          sessionId: scanBefore.sessionId,
          diagnosis: `Diperbaiki dengan ${command}`,
          commandsRun,
          scanBeforeOk: false,
          scanAfterOk: true,
        };
      }
    }
  }

  const analysis = await analyzeCodeScan(scanBefore);
  for (const command of analysis.suggestedCommands) {
    if (!canAutoFixCommand(command)) {
      continue;
    }
    const fix = await runAutoFixCommand(command, { source: "code-llm" });
    commandsRun.push(command);
    if (!fix.ok) {
      continue;
    }
    const rescan = await runCodeScan({
      sessionId: scanBefore.sessionId,
      fullBuild: Boolean(options?.fullBuild),
      echo: false,
    });
    if (rescan.ok) {
      await notify({
        title: "Code auto-fix berhasil",
        body:
          `✅ Error codebase diperbaiki otomatis (LLM).\n\n` +
          `Diagnosis: ${analysis.diagnosis.slice(0, 350)}\n\n` +
          `Perintah: \`${command}\`\n\n` +
          `_Scan ulang lulus._`,
        level: "info",
      });
      return {
        ok: true,
        sessionId: scanBefore.sessionId,
        diagnosis: analysis.diagnosis,
        commandsRun,
        scanBeforeOk: false,
        scanAfterOk: true,
      };
    }
  }

  const finalScan = await runCodeScan({
    sessionId: scanBefore.sessionId,
    fullBuild: false,
    echo: false,
  });

  if (!finalScan.ok) {
    await notify({
      title: "Code auto-fix — masih ada error",
      body:
        `⚠️ Auto-fix sudah dicoba (${commandsRun.length} perintah) tapi scan masih gagal.\n\n` +
        `${analysis.diagnosis.slice(0, 400)}\n\n` +
        `Cek Terminal di Operator (session ${scanBefore.sessionId.slice(0, 8)}).`,
      level: "warn",
    });
  }

  return {
    ok: false,
    sessionId: scanBefore.sessionId,
    diagnosis: analysis.diagnosis,
    commandsRun,
    scanBeforeOk: false,
    scanAfterOk: finalScan.ok,
  };
}
