import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

const envLocal = join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  loadEnv({ path: envLocal });
}

function envTrim(key: string): string {
  return (process.env[key] ?? "").trim();
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envList(key: string, fallback: string[] = []): string[] {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Konfigurasi worker otonom. Semua nilai bisa di-override via .env.local
 * sehingga tidak perlu mengubah kode untuk tuning di VPS.
 */
export const autonomousConfig = {
  /** Jeda antar tick OODA (ms). Default 30 detik. */
  tickIntervalMs: envInt("VANDOR_AGENT_TICK_MS", 30_000),
  /** Maks. task yang diproses per tick (cegah overload). */
  maxTasksPerTick: envInt("VANDOR_AGENT_MAX_TASKS", 3),
  /** Advisory lock key — pastikan hanya satu worker aktif. */
  advisoryLockKey: envInt("VANDOR_AGENT_LOCK_KEY", 928_374_651),
  /** Email owner untuk menautkan goal/aksi ke user. */
  ownerEmail: process.env.VANDOR_OWNER_EMAIL ?? "",
  /** Aktif tidaknya worker (kill switch level env, di atas DB). */
  enabled: process.env.VANDOR_AGENT_ENABLED !== "false",

  /** URL aplikasi Next internal (untuk kirim notifikasi via web process). */
  internalApiUrl:
    envTrim("VANDOR_INTERNAL_API_URL") || "http://127.0.0.1:3000",
  /** Secret bersama worker<->web untuk endpoint internal. */
  internalSecret: envTrim("VANDOR_AGENT_INTERNAL_SECRET"),

  /** OpenRouter (reasoning/planner). Kosong = fallback heuristik. */
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  plannerModel:
    process.env.VANDOR_AGENT_MODEL ??
    "meta-llama/llama-3.3-70b-instruct:free",
  appUrl: process.env.OPENROUTER_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",

  /** Ambang batas peringatan & kritis (persen). */
  thresholds: {
    cpuWarn: envInt("VANDOR_AGENT_CPU_WARN", 85),
    cpuCrit: envInt("VANDOR_AGENT_CPU_CRIT", 95),
    memWarn: envInt("VANDOR_AGENT_MEM_WARN", 85),
    memCrit: envInt("VANDOR_AGENT_MEM_CRIT", 95),
    diskWarn: envInt("VANDOR_AGENT_DISK_WARN", 85),
    diskCrit: envInt("VANDOR_AGENT_DISK_CRIT", 95),
  },

  /** Service systemd yang dipantau. Default kosong — Hostinger/VPS beda-beda; set via env. */
  monitoredServices: envList("VANDOR_AGENT_SERVICES", []),
  /** Proses PM2 yang dipantau (selalu sertakan worker & app). */
  pm2Processes: envList("VANDOR_AGENT_PM2", ["vandor", "vandor-agent"]),
  /** Container Docker yang dipantau (kosong = semua). */
  dockerContainers: envList("VANDOR_AGENT_DOCKER", []),
  /** Target uptime HTTP yang dicek. */
  uptimeTargets: envList("VANDOR_AGENT_UPTIME", [
    "http://127.0.0.1:3000/ping",
  ]),
  /** File log yang dibaca/di-scan error. */
  logPaths: envList("VANDOR_AGENT_LOGS", [
    "/var/log/vandor-error.log",
    "/var/log/vandor-agent-error.log",
  ]),

  /** Berapa banyak tick antar snapshot metrik tersimpan (hemat baris). */
  metricEveryTicks: envInt("VANDOR_AGENT_METRIC_EVERY", 2),

  /** Path deploy produksi (git pull + build + pm2). */
  deployPath: process.env.VANDOR_DEPLOY_PATH ?? "/var/www/vandor",
  deployBranch: process.env.VANDOR_DEPLOY_BRANCH ?? "main",

  /** Secret webhook alert eksternal (Datadog/Sentry/UptimeRobot). */
  webhookSecret: process.env.VANDOR_AGENT_WEBHOOK_SECRET ?? "",

  /** Auto-fix bug/error tanpa approval (default aktif). */
  autoFixEnabled: process.env.VANDOR_AGENT_AUTO_FIX !== "false",
  /** Auto-fix juga jalan walau mode manual. */
  autoFixWithoutAutonomousMode:
    process.env.VANDOR_AGENT_AUTO_FIX_ALWAYS === "true",

  /** Interval check-in proaktif ke owner via WA (ms). Default 4 jam. */
  proactiveCheckInMs: envInt("VANDOR_AGENT_CHECKIN_MS", 4 * 60 * 60_000),
  /** Cooldown alert isu baru ke WA (ms). Default 15 menit. */
  proactiveAlertMs: envInt("VANDOR_AGENT_ALERT_MS", 15 * 60_000),
  /** Pakai LLM untuk pesan check-in natural. */
  proactiveUseLlm: process.env.VANDOR_AGENT_PROACTIVE_LLM !== "false",

  /** Cooldown notifikasi WA gagal auto-fix / scan (ms). Default 24 jam. */
  codeFixNotifyCooldownMs: envInt(
    "VANDOR_AGENT_CODE_FIX_NOTIFY_MS",
    24 * 60 * 60_000
  ),
  /** Scheduled code_scan: jalankan auto-fix pipeline (default off — cegah spam). */
  scheduledCodeScanAutoFix:
    process.env.VANDOR_AGENT_SCHEDULED_CODE_AUTOFIX === "true",
} as const;

export type AutonomousConfig = typeof autonomousConfig;
