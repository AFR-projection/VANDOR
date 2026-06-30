import type { VandorIntent } from "@/lib/v4/intent";
import type { ExecutionPlan } from "../core/types";
import { buildHeuristicPlan } from "./heuristic-planner";
import { platformLlmJson } from "./llm";
import { normalizeExecutionPlan } from "./normalize-plan";
import { executionPlanSchema, type ParsedExecutionPlan } from "./plan-schema";

const PLANNER_SYSTEM = `Kamu Planner Agent VANDOR — buat execution plan multi-agent.
Jawab HANYA JSON valid dengan bentuk:
{"summary":"...","steps":[{"stepKey":"...","agentId":"...","input":{}}]}

Agent yang tersedia:
chat, planner, orchestrator, coding, browser, document, memory, tool, testing, fix, deploy, monitoring

Aturan:
- Akhiri dengan step agent "chat" untuk merangkum ke user (stepKey: respond).
- Permintaan file: agent "document" dengan input.format = pdf | xlsx | csv | docx sesuai permintaan user.
- Permintaan gambar baru: agent "tool" dengan input.action = "generate_image" dan prompt = deskripsi gambar.
- Excel/spreadsheet → format "xlsx". Word → "docx". PDF → "pdf".
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

  if (input.intent === "image") {
    return {
      plan: normalizeExecutionPlan(heuristic, input.userText, input.intent),
      source: "heuristic",
    };
  }

  if (!input.openRouterApiKey?.trim()) {
    return {
      plan: normalizeExecutionPlan(heuristic, input.userText, input.intent),
      source: "heuristic",
    };
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
    return {
      plan: normalizeExecutionPlan(heuristic, input.userText, input.intent),
      source: "heuristic",
    };
  }

  const parsed = executionPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      plan: normalizeExecutionPlan(heuristic, input.userText, input.intent),
      source: "heuristic",
    };
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
    plan: normalizeExecutionPlan(
      { summary: parsed.data.summary, steps },
      input.userText,
      input.intent
    ),
    source: "llm",
  };
}
