import { autonomousConfig } from "../config";
import type { LogScan } from "../logs";
import type { SystemMetrics } from "../metrics";
import type { ServiceStatus } from "../services";
import type { RiskLevel } from "../types";
import type { UptimeResult } from "../uptime";

export type Remediation = {
  description: string;
  command?: string;
  risk: RiskLevel;
};

export type Issue = {
  key: string;
  severity: "warn" | "error" | "critical";
  title: string;
  detail: string;
  remediation?: Remediation;
};

export type ObservationBundle = {
  metrics: SystemMetrics;
  services: ServiceStatus[];
  uptime: UptimeResult[];
  logs: LogScan[];
};

/** Analisis observasi → daftar isu + saran remediasi. */
export function detectIssues(obs: ObservationBundle): Issue[] {
  const issues: Issue[] = [];
  const t = autonomousConfig.thresholds;
  const { metrics, services, uptime, logs } = obs;

  if (metrics.cpuPct >= t.cpuCrit) {
    issues.push({
      key: "cpu-critical",
      severity: "critical",
      title: "CPU sangat tinggi",
      detail: `CPU ${metrics.cpuPct}% (>= ${t.cpuCrit}%) selama 1 tick.`,
    });
  } else if (metrics.cpuPct >= t.cpuWarn) {
    issues.push({
      key: "cpu-warn",
      severity: "warn",
      title: "CPU tinggi",
      detail: `CPU ${metrics.cpuPct}% (>= ${t.cpuWarn}%).`,
    });
  }

  if (metrics.memUsedPct >= t.memCrit) {
    issues.push({
      key: "mem-critical",
      severity: "critical",
      title: "Memori hampir penuh",
      detail: `RAM terpakai ${metrics.memUsedPct}% (${metrics.memUsedMb}/${metrics.memTotalMb} MB).`,
    });
  } else if (metrics.memUsedPct >= t.memWarn) {
    issues.push({
      key: "mem-warn",
      severity: "warn",
      title: "Memori tinggi",
      detail: `RAM terpakai ${metrics.memUsedPct}%.`,
    });
  }

  if (metrics.diskUsedPct != null && metrics.diskUsedPct >= t.diskCrit) {
    issues.push({
      key: "disk-critical",
      severity: "critical",
      title: "Disk hampir penuh",
      detail: `Disk ${metrics.diskUsedPct}% terpakai (sisa ${metrics.diskFreeGb ?? "?"} GB).`,
      remediation: {
        description: "Bersihkan journal lama untuk membebaskan disk.",
        command: "journalctl --vacuum-time=2d",
        risk: "moderate",
      },
    });
  } else if (metrics.diskUsedPct != null && metrics.diskUsedPct >= t.diskWarn) {
    issues.push({
      key: "disk-warn",
      severity: "warn",
      title: "Disk menipis",
      detail: `Disk ${metrics.diskUsedPct}% terpakai.`,
    });
  }

  for (const svc of services) {
    if (svc.healthy) {
      continue;
    }
    if (svc.kind === "postgres") {
      issues.push({
        key: "db-down",
        severity: "critical",
        title: "Database tidak terjangkau",
        detail: `Postgres: ${svc.state} ${svc.detail ?? ""}`.trim(),
      });
      continue;
    }
    const command =
      svc.kind === "systemd"
        ? `systemctl restart ${svc.name}`
        : svc.kind === "pm2"
          ? `pm2 restart ${svc.name}`
          : svc.kind === "docker"
            ? `docker restart ${svc.name}`
            : undefined;
    issues.push({
      key: `service-down:${svc.kind}:${svc.name}`,
      severity: "error",
      title: `Service mati: ${svc.name}`,
      detail:
        `${svc.kind} '${svc.name}' status=${svc.state}. ${svc.detail ?? ""}`.trim(),
      remediation: command
        ? {
            description: `Restart ${svc.kind} '${svc.name}'.`,
            command,
            risk: svc.kind === "pm2" ? "moderate" : "dangerous",
          }
        : undefined,
    });
  }

  for (const u of uptime) {
    if (u.up) {
      continue;
    }
    issues.push({
      key: `uptime-down:${u.url}`,
      severity: "error",
      title: "Endpoint DOWN",
      detail: `${u.url} tidak merespons (${u.error ?? `status ${u.status}`}).`,
    });
  }

  const totalLogErrors = logs.reduce((a, s) => a + s.errorCount, 0);
  if (totalLogErrors >= 10) {
    const sample = logs
      .flatMap((s) => s.errorLines)
      .slice(-3)
      .join("\n");
    issues.push({
      key: "log-errors",
      severity: "warn",
      title: "Lonjakan error di log",
      detail: `${totalLogErrors} baris error terdeteksi.\n${sample}`.slice(
        0,
        500
      ),
    });
  }

  return issues;
}
