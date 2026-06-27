import { hostname } from "node:os";
import { autonomousConfig } from "./config";
import { sqlClient } from "./db";
import { createLogger } from "./logger";
import { runTick } from "./loop";
import { acquireLease, releaseLease, renewLease } from "./state";

const log = createLogger("worker");

const INSTANCE_ID = `${hostname()}:${process.pid}:${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const LEASE_TTL_MS = Math.max(90_000, autonomousConfig.tickIntervalMs * 3);

let stopped = false;
let timer: NodeJS.Timeout | null = null;
let leaseHeld = false;

async function tickSafe(): Promise<void> {
  // Perpanjang lease tiap siklus; jika gagal, instance lain mengambil alih.
  const renewed = await renewLease(INSTANCE_ID, LEASE_TTL_MS);
  if (!renewed) {
    const reacquired = await acquireLease(INSTANCE_ID, LEASE_TTL_MS);
    if (!reacquired) {
      log.warn("Kehilangan lease — instance lain aktif. Skip tick.");
      return;
    }
  }
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
  if (leaseHeld) {
    await releaseLease(INSTANCE_ID).catch(() => {
      /* ignore */
    });
  }
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
    `VANDOR Autonomous worker start (id=${INSTANCE_ID}, tick=${autonomousConfig.tickIntervalMs}ms, once=${once})`
  );

  leaseHeld = await acquireLease(INSTANCE_ID, LEASE_TTL_MS);
  if (!leaseHeld) {
    log.warn(
      "Worker lain memegang lease aktif — instance ini berhenti (anti-duplikasi)."
    );
    await sqlClient.end({ timeout: 5 });
    process.exit(0);
  }

  if (once) {
    try {
      await runTick();
    } catch (error) {
      log.error("Tick gagal", error);
    }
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
  if (leaseHeld) {
    await releaseLease(INSTANCE_ID).catch(() => {
      /* ignore */
    });
  }
  process.exit(1);
});
