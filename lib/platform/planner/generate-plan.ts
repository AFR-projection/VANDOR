import type { VandorIntent } from "@/lib/v4/intent";
import type { ExecutionPlan } from "../core/types";
import { buildHeuristicPlan } from "./heuristic-planner";
import { platformLlmJson } from "./llm";
import { executionPlanSchema, type ParsedExecutionPlan } from "./plan-schema";

const PLANNER_SYSTEM = `Kamu Planner Agent VANDOR — buat execution plan multi-agent.
Jawab HANYA JSON valid dengan bentuk:
{"summary":"...","steps":[{"stepKey":"...","agentId":"...","input":{}}]}

Agent yang tersedia:
chat, planner, orchestrator, coding, browser, document, memory, tool, testing, fix, deploy, monitoring

Aturan:
- Akhiri dengan step agent "chat" untuk merangkum ke user (stepKey: respond).
- Maks 8 step. stepKey unik, snake-case.
- Jangan sertakan orchestrator kecuali koordinasi khusus.
- Bahasa summary: Indonesia, singkat.`;

export async function generateExecutionPlan(input: {
  userText: string;
  intent: VandorIntent;
  openRouterApiKey: string | null;
  modelId: string;
  appUrl?: string;
}): Promise<{ plan: ExecutionPlan; source: "llm" | "heuristic" }> {
  const heuristic = buildHeuristicPlan({
    userText: input.userText,
    intent: input.intent,
  });

  if (!input.openRouterApiKey?.trim()) {
    return { plan: heuristic, source: "heuristic" };
  }

  const prompt = `Intent: ${input.intent}
Permintaan user:
${input.userText.slice(0, 3000)}

Buat execution plan JSON.`;

  const raw = await platformLlmJson<ParsedExecutionPlan>(prompt, {
    apiKey: input.openRouterApiKey,
    modelId: input.modelId,
    appUrl: input.appUrl,
    system: PLANNER_SYSTEM,
    temperature: 0.1,
    maxTokens: 1200,
    timeoutMs: 35_000,
  });

  if (!raw) {
    return { plan: heuristic, source: "heuristic" };
  }

  const parsed = executionPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return { plan: heuristic, source: "heuristic" };
  }

  const hasChatStep = parsed.data.steps.some((s) => s.agentId === "chat");
  const steps = hasChatStep
    ? parsed.data.steps
    : [
        ...parsed.data.steps,
        {
          stepKey: "respond",
          agentId: "chat" as const,
          input: { message: input.userText, formatWorkflow: true },
        },
      ];

  return {
    plan: { summary: parsed.data.summary, steps },
    source: "llm",
  };
}
