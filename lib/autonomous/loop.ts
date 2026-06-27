import os from "node:os";
import { createLogger } from "./logger";
import { resolveOwnerUserId } from "./owner";
import { getAgentState, recordHeartbeat } from "./state";
import { registerBuiltinTools, runTool } from "./tools";
import type {
  Analysis,
  Observation,
  Plan,
  ToolContext,
} from "./types";

const log = createLogger("loop");

/** Fase OBSERVE — kumpulkan fakta dasar tentang host & worker. */
function observe(): Observation {
  return {
    at: new Date().toISOString(),
    facts: {
      hostname: os.hostname(),
      platform: os.platform(),
      uptimeSec: Math.round(os.uptime()),
      loadAvg: os.loadavg(),
      freeMemMb: Math.round(os.freemem() / 1024 / 1024),
      totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    },
  };
}

/** Fase ANALYZE — interpretasi observasi (Fase 0: heuristik ringan). */
function analyze(obs: Observation): Analysis {
  const issues: string[] = [];
  const freeMemMb = Number(obs.facts.freeMemMb ?? 0);
  const totalMemMb = Number(obs.facts.totalMemMb ?? 1);
  const freeRatio = freeMemMb / totalMemMb;
  if (freeRatio < 0.05) {
    issues.push(`Memori bebas sangat rendah (${Math.round(freeRatio * 100)}%)`);
  }
  return { issues, healthy: issues.length === 0 };
}

/** Fase PLAN — tentukan task (Fase 0: belum membuat task mutasi). */
function plan(analysis: Analysis): Plan {
  if (analysis.healthy) {
    return { taskTypes: [], note: "Sistem sehat — tidak ada aksi diperlukan." };
  }
  return {
    taskTypes: [],
    note: `Terdeteksi ${analysis.issues.length} isu — penanganan otomatis menyusul di fase berikutnya.`,
  };
}

/** Fase ACT — jalankan tool aman. Fase 0 hanya health-check internal. */
async function act(ctx: ToolContext): Promise<void> {
  const result = await runTool("system.ping", {}, ctx);
  if (!result.ok) {
    log.warn("system.ping gagal", result.error);
  }
}

/** Fase EVALUATE + LEARN — placeholder (diisi pada fase reasoning). */
function evaluateAndLearn(analysis: Analysis): void {
  if (!analysis.healthy) {
    log.warn("Isu terdeteksi", analysis.issues);
  }
}

/** Satu siklus OODA lengkap. */
export async function runTick(): Promise<void> {
  const state = await getAgentState();

  if (state.killSwitch) {
    log.warn("Kill switch AKTIF — semua aksi dilewati.");
    await recordHeartbeat("kill-switch");
    return;
  }

  const autonomous = state.mode === "autonomous";
  const obs = observe();
  const analysis = analyze(obs);
  const planResult = plan(analysis);

  log.debug("observe", obs.facts);
  log.info(
    `tick mode=${state.mode} healthy=${analysis.healthy} ${planResult.note}`
  );

  const ownerUserId = await resolveOwnerUserId();
  const ctx: ToolContext = { logger: log, ownerUserId, autonomous };

  registerBuiltinTools();

  // Mode manual: hanya observasi & rekomendasi, tanpa aksi mutasi.
  await act(ctx);

  evaluateAndLearn(analysis);
  await recordHeartbeat(analysis.healthy ? "healthy" : "issues-detected");
}
