import { open, stat } from "node:fs/promises";

const ERROR_RE =
  /\b(error|exception|fatal|panic|econnrefused|etimedout|segfault|unhandled|cannot find|failed)\b/i;

export type LogScan = {
  path: string;
  exists: boolean;
  lines: string[];
  errorLines: string[];
  errorCount: number;
  sizeBytes: number;
};

/** Baca N baris terakhir dari file (efisien: baca chunk dari akhir). */
async function tail(path: string, maxLines: number): Promise<string[]> {
  const info = await stat(path);
  const size = info.size;
  const chunk = Math.min(size, 64 * 1024);
  if (chunk === 0) {
    return [];
  }
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(chunk);
    await fh.read(buf, 0, chunk, size - chunk);
    const text = buf.toString("utf8");
    return text.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } finally {
    await fh.close();
  }
}

export async function scanLog(path: string, maxLines = 60): Promise<LogScan> {
  try {
    const info = await stat(path);
    const lines = await tail(path, maxLines);
    const errorLines = lines.filter((l) => ERROR_RE.test(l));
    return {
      path,
      exists: true,
      lines,
      errorLines: errorLines.slice(-15),
      errorCount: errorLines.length,
      sizeBytes: info.size,
    };
  } catch {
    return {
      path,
      exists: false,
      lines: [],
      errorLines: [],
      errorCount: 0,
      sizeBytes: 0,
    };
  }
}

export function scanLogs(paths: string[], maxLines = 60): Promise<LogScan[]> {
  return Promise.all(paths.map((p) => scanLog(p, maxLines)));
}
