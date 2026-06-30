import { isPlatformV2Enabled, platformConfig } from "../config";
import { publishPlatformEvent } from "../events/bus";
import { bootstrapPlatformV2 } from "../init";
import {
  claimRunnableWorkflowRuns,
  countActiveWorkflowRuns,
  markWorkflowRunActive,
  recoverStaleRunningSteps,
} from "../queue/claim-runs";
import { processWorkflowRun } from "./engine";

export type PlatformTickResult = {
  enabled: boolean;
  runsProcessed: number;
  stepsProcessed: number;
  staleRecovered: number;
  activeRuns: number;
  results: Array<{
    runId: string;
    status: string;
    stepsProcessed: number;
  }>;
};

/**
 * Satu tick orchestrator — dipanggil dari worker PM2 (vandor-agent).
 * Memproses antrian workflow run tanpa blocking chat route.
 */
export async function runPlatformOrchestratorTick(): Promise<PlatformTickResult> {
  if (!isPlatformV2Enabled()) {
    return {
      enabled: false,
      runsProcessed: 0,
      stepsProcessed: 0,
      staleRecovered: 0,
      activeRuns: 0,
      results: [],
    };
  }

  bootstrapPlatformV2();

  const staleRecovered = await recoverStaleRunningSteps(
    platformConfig.stepTimeoutMs
  );

  const runs = await claimRunnableWorkflowRuns(platformConfig.maxRunsPerTick);
  const results: PlatformTickResult["results"] = [];
  let stepsProcessed = 0;

  for (const run of runs) {
    await markWorkflowRunActive(run.id);
    const processed = await processWorkflowRun(run.id, run.userId, run.chatId);
    stepsProcessed += processed.stepsProcessed;
    results.push({
      runId: run.id,
      status: processed.status,
      stepsProcessed: processed.stepsProcessed,
    });
  }

  if (runs.length > 0 || staleRecovered > 0) {
    await publishPlatformEvent({
      topic: "queue.updated",
      payload: {
        runsProcessed: runs.length,
        staleRecovered,
        results,
      },
    });
  }

  const activeRuns = await countActiveWorkflowRuns();

  return {
    enabled: true,
    runsProcessed: runs.length,
    stepsProcessed,
    staleRecovered,
    activeRuns,
    results,
  };
}
