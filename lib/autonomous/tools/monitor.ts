import { systemMetric } from "@/lib/db/schema";
import { db } from "../db";
import { collectMetrics, type SystemMetrics } from "../metrics";
import { scanLogs } from "../logs";
import { autonomousConfig } from "../config";
import { collectServiceHealth } from "../services";
import { checkUrls } from "../uptime";
import type { ToolContext, ToolResult } from "../types";
import { registerTool } from "./index";

/** Simpan snapshot metrik ke DB untuk dashboard/tren. */
export async function persistMetrics(m: SystemMetrics): Promise<void> {
  try {
    await db.insert(systemMetric).values({
      host: m.host.slice(0, 128),
      cpuPct: m.cpuPct,
      memUsedPct: m.memUsedPct,
      diskUsedPct: m.diskUsedPct,
      load1x100: Math.round(m.load1 * 100),
      uptimeSec: m.uptimeSec,
      payload: m,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: surface metric persist failure
    console.error("persistMetrics failed:", error);
  }
}

let registered = false;

export function registerMonitorTools(): void {
  if (registered) {
    return;
  }
  registered = true;

  registerTool({
    name: "monitor.metrics",
    description: "Baca CPU/RAM/Disk/Load/Uptime host dan simpan snapshot.",
    risk: "safe",
    execute: async (_input: Record<string, unknown>, _ctx: ToolContext) => {
      const m = await collectMetrics();
      await persistMetrics(m);
      return {
        ok: true,
        data: m,
        summary: `cpu=${m.cpuPct}% mem=${m.memUsedPct}% disk=${m.diskUsedPct ?? "?"}%`,
      } satisfies ToolResult;
    },
  });

  registerTool({
    name: "monitor.services",
    description: "Cek status systemd/PM2/Docker/Redis/Postgres.",
    risk: "safe",
    execute: async () => {
      const services = await collectServiceHealth();
      const down = services.filter((s) => !s.healthy);
      return {
        ok: true,
        data: services,
        summary:
          down.length === 0
            ? `Semua ${services.length} service sehat`
            : `${down.length} service bermasalah: ${down.map((s) => s.name).join(", ")}`,
      } satisfies ToolResult;
    },
  });

  registerTool({
    name: "monitor.uptime",
    description: "Cek uptime URL/API yang dikonfigurasi.",
    risk: "safe",
    execute: async () => {
      const results = await checkUrls(autonomousConfig.uptimeTargets);
      const down = results.filter((r) => !r.up);
      return {
        ok: true,
        data: results,
        summary:
          down.length === 0
            ? `${results.length} endpoint UP`
            : `DOWN: ${down.map((d) => d.url).join(", ")}`,
      } satisfies ToolResult;
    },
  });

  registerTool({
    name: "monitor.logs",
    description: "Scan file log untuk error terbaru.",
    risk: "safe",
    execute: async () => {
      const scans = await scanLogs(autonomousConfig.logPaths);
      const totalErrors = scans.reduce((a, s) => a + s.errorCount, 0);
      return {
        ok: true,
        data: scans,
        summary: `${totalErrors} baris error di ${scans.filter((s) => s.exists).length} file log`,
      } satisfies ToolResult;
    },
  });
}
