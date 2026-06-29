import type { PlatformWorkflowRun, PlatformWorkflowStep } from "@/lib/db/schema";
import type { ProcessWorkflowResult } from "../orchestrator/engine";

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
    lines.push("Selesai — ini ringkasan dari tim agent di belakang layar:");
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
      const summary =
        (out?.summary as string | undefined) ??
        (out?.message as string | undefined) ??
        JSON.stringify(out ?? {}).slice(0, 200);
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
