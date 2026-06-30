/**
 * Feature flags & tuning — Multi-Agent Platform V2.
 * Semua nilai dari env; tidak ada hardcode perilaku produksi.
 */
export const platformConfig = {
  /** Aktifkan runtime platform V2 (strangler fig — chat lama tetap jalan). */
  enabled: process.env.PLATFORM_V2_ENABLED === "true",

  /** Maks. step yang diproses per tick orchestrator. */
  maxStepsPerTick: Number.parseInt(
    process.env.PLATFORM_MAX_STEPS_PER_TICK ?? "5",
    10
  ),

  /** Default retry per workflow step. */
  defaultMaxAttempts: Number.parseInt(
    process.env.PLATFORM_DEFAULT_MAX_ATTEMPTS ?? "3",
    10
  ),

  /** Timeout step (ms) — fase berikutnya enforce; disimpan untuk konfigurasi. */
  stepTimeoutMs: Number.parseInt(
    process.env.PLATFORM_STEP_TIMEOUT_MS ?? "300000",
    10
  ),

  /** Poll interval event bus SSE (ms). */
  eventPollMs: Number.parseInt(
    process.env.PLATFORM_EVENT_POLL_MS ?? "1000",
    10
  ),

  /** Maks. workflow run diproses per tick orchestrator. */
  maxRunsPerTick: Number.parseInt(
    process.env.PLATFORM_MAX_RUNS_PER_TICK ?? "3",
    10
  ),

  /** Retry backoff — base delay (ms). */
  retryBackoffBaseMs: Number.parseInt(
    process.env.PLATFORM_RETRY_BASE_MS ?? "2000",
    10
  ),

  /** Retry backoff — cap delay (ms). */
  retryBackoffMaxMs: Number.parseInt(
    process.env.PLATFORM_RETRY_MAX_MS ?? "120000",
    10
  ),
} as const;

export function isPlatformV2Enabled(): boolean {
  return process.env.PLATFORM_V2_ENABLED === "true";
}

export function isPlatformChatWorkflowEnabled(): boolean {
  return (
    isPlatformV2Enabled() && process.env.PLATFORM_V2_CHAT_WORKFLOW !== "false"
  );
}

/** Maks step saat workflow diproses sinkron dari chat (bukan worker tick). */
export function platformChatMaxSteps(): number {
  return Number.parseInt(process.env.PLATFORM_CHAT_MAX_STEPS ?? "24", 10);
}
