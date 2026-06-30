import { classifyCommand, evaluateCommand } from "../rule-engine";
import { execCommand } from "../shell-exec";
import type { ToolContext, ToolResult } from "../types";
import { registerTool } from "./index";

/**
 * Eksekusi perintah read-only via shell. Perintah mutasi/tak dikenal TIDAK
 * dijalankan di sini — dikembalikan sebagai 'needs-approval' agar gate
 * approval menangani (postur konservatif).
 */
async function runShellGuarded(
  command: string,
  ctx: ToolContext
): Promise<ToolResult> {
  const verdict = await evaluateCommand(command);
  ctx.logger.debug(`shell verdict ${verdict.decision}`, command);

  if (verdict.decision === "deny") {
    return {
      ok: false,
      error: `DITOLAK: ${verdict.reason}`,
      summary: "blocked",
    };
  }
  if (verdict.decision === "require_approval") {
    return {
      ok: false,
      error: `BUTUH APPROVAL: ${verdict.reason}`,
      data: { needsApproval: true, command, risk: verdict.risk },
      summary: "needs-approval",
    };
  }

  const res = await execCommand("/bin/sh", ["-c", command], {
    useShell: false,
    timeoutMs: 20_000,
  });
  return {
    ok: res.ok,
    data: { stdout: res.stdout, stderr: res.stderr, code: res.code },
    error: res.ok ? undefined : res.stderr.slice(0, 500) || "command failed",
    summary: res.ok ? res.stdout.slice(0, 200) : "exec-failed",
  };
}

/**
 * Eksekusi perintah yang SUDAH disetujui manusia. Tetap cek blocklist keras
 * (defense-in-depth) — tidak ada perintah destruktif walau di-approve.
 */
export async function execApprovedCommand(
  command: string
): Promise<ToolResult> {
  const verdict = classifyCommand(command);
  if (verdict.decision === "deny") {
    return {
      ok: false,
      error: `DITOLAK (blocklist keras): ${verdict.reason}`,
      summary: "blocked",
    };
  }
  const res = await execCommand("/bin/sh", ["-c", command], {
    timeoutMs: 60_000,
  });
  return {
    ok: res.ok,
    data: { stdout: res.stdout, stderr: res.stderr, code: res.code },
    error: res.ok ? undefined : res.stderr.slice(0, 500) || "command failed",
    summary: res.ok ? "executed" : "exec-failed",
  };
}

let registered = false;

export function registerShellTools(): void {
  if (registered) {
    return;
  }
  registered = true;

  registerTool<{ command: string }>({
    name: "shell.run",
    description:
      "Jalankan perintah shell read-only (mutasi otomatis butuh approval).",
    risk: "moderate",
    execute: (input, ctx) => runShellGuarded(input.command, ctx),
  });
}
