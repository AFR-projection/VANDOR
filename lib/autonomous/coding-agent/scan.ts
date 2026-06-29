import { runCliCommand, resolveAgentCwd } from "../cli/runner";
import type { CliRunOptions } from "../cli/runner";

export type CodeScanStep = {
  name: string;
  command: string;
  ok: boolean;
  exitCode: number | null;
  outputTail: string;
};

export type CodeScanResult = {
  sessionId: string;
  ok: boolean;
  steps: CodeScanStep[];
  errorCount: number;
  summary: string;
};

export type CodeScanOptions = CliRunOptions & {
  /** Jalankan npm run build (lama, ~2-5 menit). Default false untuk scan rutin. */
  fullBuild?: boolean;
  /** Jalankan npm run check / ultracite. Default false untuk scan rutin agent. */
  includeUltracite?: boolean;
};

const TAIL_LINES = 40;

function tailText(text: string, lines = TAIL_LINES): string {
  const parts = text.trim().split("\n");
  if (parts.length <= lines) {
    return parts.join("\n");
  }
  return parts.slice(-lines).join("\n");
}

/**
 * Coding agent — scan nyata: TypeScript, linter, opsional build.
 * Output penuh ada di AgentTerminalLog (sessionId).
 */
export async function runCodeScan(
  options: CodeScanOptions = {}
): Promise<CodeScanResult> {
  const sessionId = options.sessionId ?? undefined;
  const cwd = resolveAgentCwd(options.cwd);
  const steps: CodeScanStep[] = [];
  let session = sessionId ?? "";

  const runStep = async (name: string, command: string, timeoutMs: number) => {
    const res = await runCliCommand(command, {
      ...options,
      sessionId: session || undefined,
      stream: "coding",
      cwd,
      timeoutMs,
      echo: options.echo,
    });
    if (!session) {
      session = res.sessionId;
    }
    const combined = `${res.stdout}\n${res.stderr}`.trim();
    steps.push({
      name,
      command,
      ok: res.ok,
      exitCode: res.exitCode,
      outputTail: tailText(combined),
    });
    return res.ok;
  };

  await runStep(
    "git-head",
    "git rev-parse --short HEAD && git log -1 --oneline",
    15_000
  );
  await runStep("git-dirty", "git status -sb", 15_000);

  const hasTs = await runCliCommand(
    "test -f tsconfig.json && echo yes || echo no",
    {
      sessionId: session || undefined,
      stream: "coding",
      cwd,
      timeoutMs: 5000,
      echo: false,
    }
  );
  if (!session) {
    session = hasTs.sessionId;
  }

  if (hasTs.stdout.includes("yes")) {
    await runStep(
      "typescript",
      "npx tsc --noEmit --pretty false 2>&1",
      180_000
    );
  }

  if (options.includeUltracite) {
    await runStep(
      "ultracite",
      "npm run check 2>&1",
      120_000
    );
  }

  if (options.fullBuild) {
    await runStep("build", "npm run build 2>&1", 600_000);
  }

  const errorCount = steps.filter((s) => !s.ok).length;
  const failed = steps.filter((s) => !s.ok).map((s) => s.name);
  const ok = errorCount === 0;

  const summary = ok
    ? `Scan OK — ${steps.length} langkah lulus di ${cwd}`
    : `Scan GAGAL — ${errorCount} langkah: ${failed.join(", ")}`;

  await runCliCommand(`echo "${summary.replace(/"/g, "'")}"`, {
    sessionId: session,
    stream: "coding",
    cwd,
    timeoutMs: 5000,
    echo: options.echo,
  });

  return {
    sessionId: session,
    ok,
    steps,
    errorCount,
    summary,
  };
}
