import type { VandorIntent } from "@/lib/v4/intent";
import { detectDocumentExportFormat } from "../document/detect-format";
import type { ExecutionPlan } from "../core/types";

/** Pastikan setiap step punya userRequest/message — LLM planner sering kirim input kosong. */
export function normalizeExecutionPlan(
  plan: ExecutionPlan,
  userText: string,
  intent: VandorIntent
): ExecutionPlan {
  const trimmed = userText.trim();
  const exportFormat = detectDocumentExportFormat(trimmed);
  const base = {
    userRequest: trimmed,
    message: trimmed,
    query: trimmed,
    intent,
    format: exportFormat,
  };

  return {
    summary: plan.summary,
    steps: plan.steps.map((step) => {
      const input = step.input ?? {};
      const isChatRespond = step.agentId === "chat";
      return {
        ...step,
        input: {
          ...base,
          ...input,
          userRequest: String(input.userRequest ?? trimmed),
          query: String(input.query ?? trimmed),
          message: isChatRespond
            ? String(input.message ?? trimmed)
            : String(input.message ?? input.userRequest ?? trimmed),
          intent: input.intent ?? intent,
          format: String(input.format ?? exportFormat),
          formatWorkflow:
            input.formatWorkflow ?? (isChatRespond ? true : undefined),
        },
      };
    }),
  };
}
