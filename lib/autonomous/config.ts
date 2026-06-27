import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
} as const;

export type AutonomousConfig = typeof autonomousConfig;
