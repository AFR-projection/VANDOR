import { autonomousConfig } from "./config";
import { sqlClient } from "./db";
import { createLogger } from "./logger";
import { runTick } from "./loop";

const log = createLogger("worker");

let stopped = false;
let timer: NodeJS.Timeout | null = null;
let lockAcquired = false;

async function acquireLock(): Promise<boolean> {
  const rows = await sqlClient<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${autonomousConfig.advisoryLockKey}) AS locked
  `;
  return rows[0]?.locked === true;
}

async function releaseLock(): Promise<void> {
  if (!lockAcquired) {
    return;
  }
  try {
    await sqlClient`SELECT pg_advisory_unlock(${autonomousConfig.advisoryLockKey})`;
  } catch (error) {
    log.error("Gagal melepas advisory lock", error);
  }
}

async function tickSafe(): Promise<void> {
  try {
    await runTick();
  } catch (error) {
    log.error("Tick gagal", error);
  }
}

function scheduleNext(): void {
  if (stopped) {
    return;
  }
  timer = setTimeout(async () => {
    await tickSafe();
    scheduleNext();
  }, autonomousConfig.tickIntervalMs);
}

async function shutdown(signal: string): Promise<void> {
  if (stopped) {
    return;
  }
  stopped = true;
  log.info(`Menerima ${signal} — shutdown rapi...`);
  if (timer) {
    clearTimeout(timer);
  }
  await releaseLock();
  try {
    await sqlClient.end({ timeout: 5 });
  } catch {
    // ignore
  }
  process.exit(0);
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");

  if (!autonomousConfig.enabled) {
    log.warn("VANDOR_AGENT_ENABLED=false — worker tidak dijalankan.");
    process.exit(0);
  }

  log.info(
    `VANDOR Autonomous worker start (tick=${autonomousConfig.tickIntervalMs}ms, once=${once})`
  );

  lockAcquired = await acquireLock();
  if (!lockAcquired) {
    log.warn(
      "Worker lain sudah memegang lock — instance ini berhenti (mencegah duplikasi)."
    );
    await sqlClient.end({ timeout: 5 });
    process.exit(0);
  }

  if (once) {
    await tickSafe();
    await shutdown("once");
    return;
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await tickSafe();
  scheduleNext();
}

main().catch(async (error) => {
  log.error("Worker fatal", error);
  await releaseLock();
  process.exit(1);
});
