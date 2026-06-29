import type { Assessment } from "./planner";
import type { Issue } from "./healing/detectors";
import { emitEvent } from "./events";
import { isLlmConfigured, llmJson } from "./llm";
import { enqueueTask } from "./tasks";

export type PlannedStep = {
  type: string;
  title: string;
  payload?: Record<string, unknown>;
  priority?: number;
};

type ActPlan = {
  steps?: PlannedStep[];
  rationale?: string;
};

const SYSTEM = `Kamu VANDOR Operator SRE. Sistem degraded/critical — buat rencana observasi AMAN (max 3 step).
Tipe valid: monitor, uptime_check, log_scan, shell (HANYA read-only: df -h, free -m, pm2 jlist, systemctl status).
DILARANG: rm, reboot, deploy, git pull, restart service.
JSON only: {"steps":[{"type":"monitor","title":"...","priority":6}],"rationale":"..."}`;

/**
 * Planner→Act: dari penilaian LLM + isu, enqueue task observasi.
 * Tidak auto-eksekusi mutasi — hanya langkah aman.
 */
export async function planAndActFromAssessment(input: {
  assessment: Assessment;
  issues: Issue[];
}): Promise<number> {
  if (
    input.assessment.status !== "degraded" &&
    input.assessment.status !== "critical"
  ) {
    return 0;
  }

  let steps: PlannedStep[] = [];

  if (await isLlmConfigured()) {
    const compact = {
      status: input.assessment.status,
      summary: input.assessment.summary,
      recommendations: input.assessment.recommendations,
      issues: input.issues.map((i) => `${i.severity}:${i.title}`),
    };
    const res = await llmJson<ActPlan>(
      `Kondisi:\n${JSON.stringify(compact)}\n\nBuat steps JSON.`,
      { system: SYSTEM, temperature: 0.1, maxTokens: 500, timeoutMs: 25_000 }
    );
    if (res?.steps?.length) {
      steps = res.steps.slice(0, 3);
    }
  }

  if (steps.length === 0) {
    steps = [
      { type: "monitor", title: "Auto-plan: snapshot metrik", priority: 6 },
      { type: "log_scan", title: "Auto-plan: scan log error", priority: 5 },
    ];
    if (input.issues.some((i) => i.key.startsWith("uptime"))) {
      steps.unshift({
        type: "uptime_check",
        title: "Auto-plan: cek endpoint uptime",
        priority: 7,
      });
    }
  }

  let enqueued = 0;
  for (const step of steps) {
    const { deduped } = await enqueueTask({
      type: step.type,
      title: step.title.slice(0, 500),
      payload: step.payload ?? null,
      priority: step.priority ?? 5,
      dedupe: true,
    });
    if (!deduped) {
      enqueued += 1;
    }
  }

  if (enqueued > 0) {
    await emitEvent({
      type: "planner-act",
      severity: input.assessment.status === "critical" ? "critical" : "warn",
      source: "planner",
      message: `Planner→Act: ${enqueued} langkah (${input.assessment.summary.slice(0, 120)})`,
      payload: { steps: steps.map((s) => s.title) },
    });
  }

  return enqueued;
}
