import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { autonomousConfig } from "../config";
import {
  appendTerminalLine,
  newTerminalSessionId,
} from "../terminal-log";
import type { AgentTerminalStream } from "@/lib/db/schema";

export type CliRunResult = {
  sessionId: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type CliRunOptions = {
  sessionId?: string;
  stream?: AgentTerminalStream;
  taskId?: string;
  cwd?: string;
  timeoutMs?: number;
  /** Tulis ke process.stdout/stderr (untuk script CLI interaktif). */
  echo?: boolean;
  maxBuffer?: number;
};

export function resolveAgentCwd(override?: string): string {
  const preferred = override ?? autonomousConfig.deployPath;
  if (preferred && existsSync(preferred)) {
    return preferred;
  }
  return process.cwd();
}

function resolveCwd(override?: string): string {
  return resolveAgentCwd(override);
}

function shellSpawn(command: string): {
  bin: string;
  args: string[];
} {
  if (process.platform === "win32") {
    return { bin: "cmd.exe", args: ["/d", "/s", "/c", command] };
  }
  return { bin: "/bin/sh", args: ["-c", command] };
}

async function logLine(
  sessionId: string,
  stream: AgentTerminalStream,
  line: string,
  level: "stdout" | "stderr" | "info" | "error" | "cmd",
  opts: CliRunOptions,
  command?: string,
  exitCode?: number
): Promise<void> {
  if (opts.echo) {
    const prefix =
      level === "stderr" || level === "error"
        ? "[stderr]"
        : level === "cmd"
          ? "$"
          : level === "info"
            ? "[info]"
            : "";
    const out = prefix ? `${prefix} ${line}` : line;
    if (level === "stderr" || level === "error") {
      process.stderr.write(`${out}\n`);
    } else {
      process.stdout.write(`${out}\n`);
    }
  }
  await appendTerminalLine({
    sessionId,
    stream,
    line,
    level,
    command,
    exitCode,
    taskId: opts.taskId,
  });
}

/**
 * Jalankan perintah shell NYATA di VPS/host.
 * Setiap baris output disimpan ke AgentTerminalLog — bukan simulasi UI.
 */
export async function runCliCommand(
  command: string,
  options: CliRunOptions = {}
): Promise<CliRunResult> {
  const sessionId = options.sessionId ?? newTerminalSessionId();
  const stream = options.stream ?? "cli";
  const cwd = resolveCwd(options.cwd);
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxBuffer = options.maxBuffer ?? 512 * 1024;

  await logLine(
    sessionId,
    stream,
    `host=${hostname()} cwd=${cwd}`,
    "info",
    options
  );
  await logLine(sessionId, stream, command, "cmd", options, command);

  const { bin, args } = shellSpawn(command);

  return new Promise<CliRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const flushLines = async (
      chunk: string,
      level: "stdout" | "stderr"
    ): Promise<void> => {
      if (level === "stdout" && stdout.length < maxBuffer) {
        stdout += chunk;
      } else if (level === "stderr" && stderr.length < maxBuffer) {
        stderr += chunk;
      }
      for (const line of chunk.split("\n")) {
        const trimmed = line.trimEnd();
        if (trimmed.length > 0) {
          await logLine(sessionId, stream, trimmed, level, options, command);
        }
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      void flushLines(chunk.toString(), "stdout");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      void flushLines(chunk.toString(), "stderr");
    });

    const finish = async (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const ok = !timedOut && code === 0;
      const summary = timedOut
        ? `TIMEOUT setelah ${timeoutMs}ms`
        : `exit code ${code ?? "?"}`;
      await logLine(
        sessionId,
        stream,
        summary,
        ok ? "info" : "error",
        options,
        command,
        code ?? undefined
      );
      resolve({
        sessionId,
        ok,
        exitCode: code,
        stdout: stdout.slice(0, maxBuffer),
        stderr: stderr.slice(0, maxBuffer),
        timedOut,
      });
    };

    child.on("error", (err) => {
      void logLine(sessionId, stream, err.message, "error", options, command);
      void finish(null);
    });
    child.on("close", (code) => {
      void finish(code);
    });
  });
}

/** Snapshot status VPS nyata — PM2, git, disk. */
export async function runStatusSnapshot(
  options: CliRunOptions = {}
): Promise<CliRunResult & { commands: string[] }> {
  const sessionId = options.sessionId ?? newTerminalSessionId();
  const commands = [
    "uname -a 2>/dev/null || ver",
    "uptime 2>/dev/null || echo uptime-n/a",
    "df -h / 2>/dev/null || wmic logicaldisk get size,freespace,caption",
    "free -h 2>/dev/null || echo mem-n/a",
    "pm2 jlist 2>/dev/null || echo pm2-not-installed",
    "git rev-parse --short HEAD 2>/dev/null && git status -sb 2>/dev/null || echo git-n/a",
    "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ping 2>/dev/null || echo ping-fail",
  ];

  let last: CliRunResult = {
    sessionId,
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
  };

  for (const command of commands) {
    // biome-ignore lint/nursery/noAwaitInLoop: status berurutan agar log terbaca
    last = await runCliCommand(command, {
      ...options,
      sessionId,
      stream: "cli",
      timeoutMs: 30_000,
    });
  }

  return { ...last, commands };
}
