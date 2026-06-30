import type { PlatformWorkflowRun, PlatformWorkflowStep } from "@/lib/db/schema";
import type { ProcessWorkflowResult } from "../orchestrator/engine";

function stepResultSummary(out: Record<string, unknown> | null): string {
  if (!out) {
    return "—";
  }
  if (typeof out.summary === "string" && out.summary.trim()) {
    return out.summary;
  }
  if (typeof out.message === "string" && out.message.trim()) {
    return out.message.slice(0, 240);
  }
  const scan = out.scan as { summary?: string } | undefined;
  if (scan?.summary) {
    return scan.summary;
  }
  const dispatch = out.dispatch as { message?: string; taskId?: string } | undefined;
  if (dispatch?.message) {
    return dispatch.message;
  }
  if (dispatch?.taskId) {
    return `Task worker ${dispatch.taskId.slice(0, 8)}…`;
  }
  const search = out.search as { sources?: unknown[] } | undefined;
  if (search?.sources) {
    return `${search.sources.length} sumber web`;
  }
  return JSON.stringify(out).slice(0, 200);
}

export function formatPlatformWorkflowReply(input: {
  userText: string;
  planSummary: string;
  planSource: "llm" | "heuristic";
  processed: ProcessWorkflowResult;
  steps: PlatformWorkflowStep[];
  run: PlatformWorkflowRun | null;
}): string {
  const lines: string[] = [];

  if (input.processed.status === "completed") {
    lines.push("✅ **Multi-Agent Workflow selesai** — ringkasan dari tim agent:");
  } else if (input.processed.status === "waiting") {
    lines.push(
      "Workflow masih berjalan (retry/backoff). Hasil sementara:"
    );
  } else {
    lines.push("Workflow gagal pada salah satu step. Detail:");
  }

  lines.push("");
  lines.push(`**Rencana:** ${input.planSummary}`);

  const completed = input.steps.filter((s) => s.status === "completed");
  if (completed.length > 0) {
    lines.push("");
    lines.push("**Langkah selesai:**");
    for (const s of completed) {
      const out = s.output as Record<string, unknown> | null;
      const summary = stepResultSummary(out);
      lines.push(`- \`${s.agentId}\` (${s.stepKey}): ${summary}`);
    }
  }

  const failed = input.steps.find((s) => s.status === "failed");
  if (failed?.error) {
    lines.push("");
    lines.push(`**Error:** ${failed.error}`);
  }

  if (input.run?.id) {
    lines.push("");
    lines.push(
      `_Workflow \`${input.run.id.slice(0, 8)}…\` · planner: ${input.planSource}_`
    );
  }

  if (input.processed.status === "completed" && completed.length > 0) {
    const chatStep = completed.find((s) => s.agentId === "chat");
    if (chatStep?.output) {
      const out = chatStep.output as Record<string, unknown>;
      const msg = out.deliverToUser ? String(out.message ?? "") : "";
      if (msg.trim()) {
        lines.push("");
        lines.push(msg.trim());
      }
    }
  }

  return lines.join("\n").trim();
}
