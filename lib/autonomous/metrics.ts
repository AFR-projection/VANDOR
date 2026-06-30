import { readFile } from "node:fs/promises";
import os from "node:os";
import { execCommand } from "./shell-exec";

export type SystemMetrics = {
  host: string;
  platform: string;
  cpuPct: number;
  memUsedPct: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedPct: number | null;
  diskFreeGb: number | null;
  load1: number;
  uptimeSec: number;
  cpuCount: number;
  at: string;
};

function cpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }
  return { idle, total };
}

/** Persentase CPU dari dua sampel waktu (akurat lintas platform). */
async function sampleCpuPct(): Promise<number> {
  const a = cpuTimes();
  await new Promise((r) => setTimeout(r, 200));
  const b = cpuTimes();
  const idleDelta = b.idle - a.idle;
  const totalDelta = b.total - a.total;
  if (totalDelta <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))
  );
}

async function linuxMem(): Promise<{ usedMb: number; totalMb: number } | null> {
  try {
    const raw = await readFile("/proc/meminfo", "utf8");
    const get = (key: string) => {
      const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
      return m ? Number.parseInt(m[1], 10) : null;
    };
    const total = get("MemTotal");
    const available = get("MemAvailable");
    if (total == null || available == null) {
      return null;
    }
    const totalMb = Math.round(total / 1024);
    const usedMb = Math.round((total - available) / 1024);
    return { usedMb, totalMb };
  } catch {
    return null;
  }
}

async function linuxDisk(
  mount = "/"
): Promise<{ usedPct: number; freeGb: number } | null> {
  const res = await execCommand("df", ["-Pk", mount], { timeoutMs: 5000 });
  if (!res.ok) {
    return null;
  }
  const line = res.stdout.trim().split("\n").at(-1) ?? "";
  const cols = line.split(/\s+/);
  if (cols.length < 5) {
    return null;
  }
  const availableKb = Number.parseInt(cols[3], 10);
  const usePct = Number.parseInt(cols[4].replace("%", ""), 10);
  if (!(Number.isFinite(availableKb) && Number.isFinite(usePct))) {
    return null;
  }
  return { usedPct: usePct, freeGb: Math.round(availableKb / 1024 / 1024) };
}

/** Kumpulkan snapshot metrik sistem saat ini. */
export async function collectMetrics(): Promise<SystemMetrics> {
  const isLinux = process.platform === "linux";
  const [cpuPct, mem, disk] = await Promise.all([
    sampleCpuPct(),
    isLinux ? linuxMem() : Promise.resolve(null),
    isLinux ? linuxDisk("/") : Promise.resolve(null),
  ]);

  const totalMb = mem?.totalMb ?? Math.round(os.totalmem() / 1024 / 1024);
  const usedMb =
    mem?.usedMb ?? Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
  const memUsedPct = totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0;

  return {
    host: os.hostname(),
    platform: process.platform,
    cpuPct,
    memUsedPct,
    memUsedMb: usedMb,
    memTotalMb: totalMb,
    diskUsedPct: disk?.usedPct ?? null,
    diskFreeGb: disk?.freeGb ?? null,
    load1: Number(os.loadavg()[0].toFixed(2)),
    uptimeSec: Math.round(os.uptime()),
    cpuCount: os.cpus().length,
    at: new Date().toISOString(),
  };
}
