import type { AgentGoal } from "@/lib/db/schema";
import { emitEvent } from "./events";
import { isLlmConfigured, llmJson } from "./llm";
import { enqueueTask } from "./tasks";

export type PlannedGoalTask = {
  type: string;
  title: string;
  payload?: Record<string, unknown>;
  priority?: number;
};

type PlanResponse = {
  tasks?: PlannedGoalTask[];
  note?: string;
};

const SYSTEM = `Kamu VANDOR Operator — planner goal jangka panjang untuk server Linux.
Dari goal owner, buat 1-3 task konkret yang AMAN (monitoring, uptime, log scan, laporan).
JANGAN perintah destruktif (rm, reboot, git push, deploy tanpa approval).
Tipe task valid: uptime_check, log_scan, monitor, daily_report, shell (hanya read-only: df, free, pm2 list, systemctl status).
Jawab HANYA JSON: {"tasks":[{"type":"...","title":"...","payload":{},"priority":5}],"note":"..."}`;

/**
 * LLM pecah goal aktif menjadi task antrian. Fallback heuristik bila LLM off.
 */
export async function planTasksFromGoal(goal: AgentGoal): Promise<number> {
  let planned: PlannedGoalTask[] = [];

  if (await isLlmConfigured()) {
    const prompt = `Goal:\nJudul: ${goal.title}\nDeskripsi: ${goal.description ?? "(kosong)"}\nPrioritas: ${goal.priority}\n\nBuat task JSON.`;
    const res = await llmJson<PlanResponse>(prompt, {
      system: SYSTEM,
      temperature: 0.15,
      maxTokens: 600,
      timeoutMs: 30_000,
    });
    if (res?.tasks?.length) {
      planned = res.tasks.slice(0, 3);
    }
  }

  if (planned.length === 0) {
    planned = [
      {
        type: "monitor",
        title: `Goal: ${goal.title} — cek metrik`,
        priority: goal.priority,
      },
      {
        type: "uptime_check",
        title: `Goal: ${goal.title} — cek uptime`,
        priority: Math.max(1, goal.priority - 1),
      },
    ];
  }

  let enqueued = 0;
  for (const item of planned) {
    const { deduped } = await enqueueTask({
      type: item.type,
      title: item.title.slice(0, 500),
      payload: item.payload ?? null,
      goalId: goal.id,
      priority: item.priority ?? goal.priority,
      dedupe: true,
    });
    if (!deduped) {
      enqueued += 1;
    }
  }

  if (enqueued > 0) {
    await emitEvent({
      type: "goal-planned",
      severity: "info",
      source: "planner",
      message: `Goal "${goal.title}" → ${enqueued} task baru`,
      payload: { goalId: goal.id, tasks: planned.map((t) => t.title) },
    });
  }

  return enqueued;
}

/** Plan semua goal aktif (dibatasi per tick). */
export async function processActiveGoals(maxGoals = 2): Promise<number> {
  const { listActiveGoals } = await import("./goals");
  const goals = await listActiveGoals(maxGoals);
  let total = 0;
  for (const goal of goals) {
    // biome-ignore lint/nursery/noAwaitInLoop: goal kecil, berurutan
    total += await planTasksFromGoal(goal);
  }
  return total;
}
