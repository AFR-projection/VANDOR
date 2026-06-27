import { desc } from "drizzle-orm";
import {
  type AgentActionStatus,
  agentAction,
  type AgentRiskLevel,
} from "@/lib/db/schema";
import { db } from "./db";

export type AgentActionInput = {
  taskId?: string | null;
  tool: string;
  action: string;
  input?: unknown;
  output?: unknown;
  status?: AgentActionStatus;
  riskLevel?: AgentRiskLevel;
  reason?: string | null;
  durationMs?: number;
};

/**
 * Catat satu aksi otonom ke audit log. Setiap tindakan worker WAJIB
 * melewati fungsi ini agar seluruh jejak tindakan terekam.
 */
export async function recordAgentAction(
  entry: AgentActionInput
): Promise<void> {
  try {
    await db.insert(agentAction).values({
      taskId: entry.taskId ?? null,
      tool: entry.tool.slice(0, 64),
      action: entry.action.slice(0, 128),
      input: safeJson(entry.input),
      output: safeJson(entry.output),
      status: entry.status ?? "ok",
      riskLevel: entry.riskLevel ?? "safe",
      reason: entry.reason ?? null,
      durationMs: entry.durationMs ?? null,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: audit failure must surface in logs
    console.error("recordAgentAction failed:", error);
  }
}

export async function listAgentActions(limit = 100) {
  return db
    .select()
    .from(agentAction)
    .orderBy(desc(agentAction.createdAt))
    .limit(limit);
}

function safeJson(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { unserializable: String(value).slice(0, 500) };
  }
}
