import { spawn } from "node:child_process";

export type ExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type ExecOptions = {
  /** Timeout ms (default 15 dtk). */
  timeoutMs?: number;
  /** Working directory. */
  cwd?: string;
  /** Batas output yang disimpan (karakter). */
  maxBuffer?: number;
  /** Jalankan via shell (HANYA setelah lolos rule engine). */
  useShell?: boolean;
};

/**
 * Eksekusi perintah dengan argv terpisah (default TANPA shell → aman dari
 * injeksi). Selalu dibatasi timeout & ukuran output.
 */
export function execCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBuffer = options.maxBuffer ?? 256 * 1024;

  return new Promise<ExecResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.useShell ?? false,
      windowsHide: true,
      env: process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        code,
        stdout: stdout.slice(0, maxBuffer),
        stderr: stderr.slice(0, maxBuffer),
        timedOut,
      });
    };

    child.stdout?.on("data", (chunk) => {
      if (stdout.length < maxBuffer) {
        stdout += chunk.toString();
      }
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < maxBuffer) {
        stderr += chunk.toString();
      }
    });
    child.on("error", (err) => {
      stderr += `\n${err.message}`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

/** True jika sebuah binary tersedia di PATH. */
export async function commandExists(bin: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  const res = await execCommand(probe, [bin], { timeoutMs: 4000 });
  return res.ok && res.stdout.trim().length > 0;
}
