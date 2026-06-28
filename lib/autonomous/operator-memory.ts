import { userMemory } from "@/lib/db/schema";
import { db } from "./db";
import type { Issue } from "./healing/detectors";

/**
 * Simpan insiden operator ke memori owner.
 * Worker-safe: tidak impor lib/memory/queries (server-only).
 * Insert langsung — tanpa embedding (cukup untuk log insiden).
 */
export async function recordOperatorIncident(input: {
  userId: string | null;
  issue: Issue;
  outcome?: "detected" | "approval_requested" | "remediated" | "failed" | "auto_fixed" | "auto_fix_failed";
  command?: string;
}): Promise<void> {
  if (!input.userId) {
    return;
  }

  const lines = [
    `[Operator ${new Date().toISOString().slice(0, 16)}]`,
    `${input.issue.severity.toUpperCase()}: ${input.issue.title}`,
    input.issue.detail.slice(0, 800),
  ];
  if (input.command) {
    lines.push(`Aksi: ${input.command}`);
  }
  if (input.outcome) {
    lines.push(`Status: ${input.outcome}`);
  }

  const content = lines.join("\n").trim();
  if (!content) {
    return;
  }

  try {
    await db.insert(userMemory).values({
      userId: input.userId,
      content: content.slice(0, 4000),
      category: "event",
      importance: input.issue.severity === "critical" ? 9 : 7,
      metadata: {
        source: "vandor-operator",
        issueKey: input.issue.key,
        outcome: input.outcome ?? "detected",
        preExtracted: true,
      },
    });
  } catch {
    /* non-fatal — worker tetap jalan */
  }
}

export async function recordApprovalDecision(input: {
  userId: string | null;
  issueKey: string;
  decision: "approved" | "rejected";
  summary: string;
}): Promise<void> {
  if (!input.userId) {
    return;
  }

  const content = `[Operator approval] ${input.issueKey}: ${input.decision} — ${input.summary.slice(0, 400)}`;

  try {
    await db.insert(userMemory).values({
      userId: input.userId,
      content,
      category: "instruction",
      importance: 6,
      metadata: {
        source: "vandor-operator",
        issueKey: input.issueKey,
        preExtracted: true,
      },
    });
  } catch {
    /* non-fatal */
  }
}
