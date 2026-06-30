import type {
  PlatformWorkflowRun,
  PlatformWorkflowStep,
} from "@/lib/db/schema";
import { platformAgentLabel } from "./agent-labels";
import type { ProcessWorkflowResult } from "../orchestrator/engine";

export function summarizeStepOutput(
  out: Record<string, unknown> | null | undefined
): string {
  if (!out) {
    return "";
  }
  if (typeof out.summary === "string" && out.summary.trim()) {
    return out.summary.trim();
  }
  if (typeof out.message === "string" && out.message.trim()) {
    return out.message.trim().slice(0, 500);
  }
  const document = out.document as
    | { url?: string; filename?: string; kind?: string; title?: string }
    | undefined;
  if (document?.url) {
    const label =
      document.filename ??
      document.title ??
      (document.kind === "xlsx"
        ? "spreadsheet.xlsx"
        : document.kind === "docx"
          ? "document.docx"
          : document.kind === "csv"
            ? "data.csv"
            : "document.pdf");
    return `📎 [Unduh ${label}](${document.url})`;
  }
  const scan = out.scan as { summary?: string } | undefined;
  if (scan?.summary) {
    return scan.summary;
  }
  const metrics = out.metrics as { summary?: string } | undefined;
  if (metrics?.summary) {
    return metrics.summary;
  }
  const dispatch = out.dispatch as
    | { message?: string; taskId?: string }
    | undefined;
  if (dispatch?.message) {
    return dispatch.message;
  }
  if (dispatch?.taskId) {
    return `Task worker ${dispatch.taskId.slice(0, 8)}…`;
  }
  const search = out.search as { sources?: unknown[] } | undefined;
  if (search?.sources) {
    return `${search.sources.length} sumber web ditemukan`;
  }
  const analysis = out.analysis as { diagnosis?: string } | undefined;
  if (analysis?.diagnosis) {
    return analysis.diagnosis.slice(0, 400);
  }
  const platformTests = out.platformTests as { summary?: string } | undefined;
  if (platformTests?.summary) {
    return platformTests.summary;
  }
  const note = out.note as string | undefined;
  if (note?.trim()) {
    return note.trim();
  }
  return "";
}

export function synthesizeChatFromWorkflowSteps(input: {
  userText: string;
  priorSteps: Array<{
    stepKey: string;
    agentId: string;
    output: Record<string, unknown>;
  }>;
}): string {
  const lines: string[] = [];
  for (const step of input.priorSteps) {
    const summary = summarizeStepOutput(step.output);
    if (!summary) {
      continue;
    }
    lines.push(
      `**${platformAgentLabel(step.agentId)}** (${step.stepKey}): ${summary}`
    );
  }

  if (lines.length === 0) {
    return input.userText.trim()
      ? `Sudah diproses tim agent untuk: ${input.userText.trim().slice(0, 300)}`
      : "Workflow selesai — tidak ada output teks dari agent.";
  }

  return lines.join("\n\n");
}

export function formatPlatformWorkflowReply(input: {
  userText: string;
  planSummary: string;
  planSource: "llm" | "heuristic";
  processed: ProcessWorkflowResult;
  steps: PlatformWorkflowStep[];
  run: PlatformWorkflowRun | null;
}): string {
  const completed = input.steps.filter((s) => s.status === "completed");
  const pending = input.steps.filter(
    (s) =>
      s.status === "queued" ||
      s.status === "pending" ||
      s.status === "running" ||
      s.status === "waiting"
  );
  const failed = input.steps.filter((s) => s.status === "failed");

  const chatStep = completed.find((s) => s.agentId === "chat");
  const chatOut = chatStep?.output as Record<string, unknown> | undefined;
  const chatMsg =
    chatOut?.deliverToUser && typeof chatOut.message === "string"
      ? chatOut.message.trim()
      : "";

  if (input.processed.status === "completed" && chatMsg) {
    return chatMsg;
  }

  if (input.processed.status === "completed") {
    const synthesized = synthesizeChatFromWorkflowSteps({
      userText: input.userText,
      priorSteps: completed
        .filter((s) => s.agentId !== "chat")
        .map((s) => ({
          stepKey: s.stepKey,
          agentId: s.agentId,
          output: (s.output as Record<string, unknown>) ?? {},
        })),
    });
    if (synthesized) {
      return `✅ **Multi-Agent Workflow selesai**\n\n${synthesized}`;
    }
  }

  const lines: string[] = [];

  if (input.processed.status === "completed") {
    lines.push("✅ **Multi-Agent Workflow selesai**");
  } else if (input.processed.status === "waiting") {
    lines.push(
      "⏳ **Workflow masih berjalan** — beberapa agent menunggu retry atau antrian."
    );
  } else if (input.processed.status === "failed") {
    lines.push("❌ **Workflow gagal** pada salah satu langkah.");
  } else {
    lines.push("🔄 **Workflow masih diproses** — hasil sementara:");
  }

  lines.push("");
  lines.push(`**Rencana:** ${input.planSummary}`);

  if (completed.length > 0) {
    lines.push("");
    lines.push("**Selesai:**");
    for (const s of completed) {
      const summary =
        summarizeStepOutput(s.output as Record<string, unknown>) ||
        "Step OK";
      lines.push(`- ${platformAgentLabel(s.agentId)} · ${s.stepKey}: ${summary}`);
    }
  }

  if (pending.length > 0) {
    lines.push("");
    lines.push("**Menunggu:**");
    for (const s of pending) {
      lines.push(
        `- ${platformAgentLabel(s.agentId)} · ${s.stepKey} (${s.status})`
      );
    }
  }

  for (const s of failed) {
    if (s.error) {
      lines.push("");
      lines.push(`**Error (${s.agentId}):** ${s.error}`);
    }
  }

  if (chatMsg) {
    lines.push("");
    lines.push(chatMsg);
  }

  if (input.run?.id) {
    lines.push("");
    lines.push(
      `_Run \`${input.run.id.slice(0, 8)}…\` · planner: ${input.planSource}_`
    );
  }

  return lines.join("\n").trim();
}
