import { saveMemory } from "@/lib/memory/queries";
import type { MemoryMetadata } from "@/lib/memory/metadata";
import type { Issue } from "./healing/detectors";

function operatorMeta(extra: Record<string, string>): MemoryMetadata {
  return { preExtracted: true, ...extra } as MemoryMetadata;
}

/**
 * Simpan insiden operator ke memori pgvector owner — hindari lupa konteks remediasi.
 */
export async function recordOperatorIncident(input: {
  userId: string | null;
  issue: Issue;
  outcome?: "detected" | "approval_requested" | "remediated" | "failed";
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

  await saveMemory({
    userId: input.userId,
    content: lines.join("\n"),
    category: "event",
    importance: input.issue.severity === "critical" ? 9 : 7,
    metadata: operatorMeta({
      source: "vandor-operator",
      issueKey: input.issue.key,
      outcome: input.outcome ?? "detected",
    }),
    mergeSimilar: true,
  });
}

/** Ringkas approval yang sudah pernah ditolak/disetujui untuk issue key sama. */
export async function recordApprovalDecision(input: {
  userId: string | null;
  issueKey: string;
  decision: "approved" | "rejected";
  summary: string;
}): Promise<void> {
  if (!input.userId) {
    return;
  }
  await saveMemory({
    userId: input.userId,
    content: `[Operator approval] ${input.issueKey}: ${input.decision} — ${input.summary.slice(0, 400)}`,
    category: "instruction",
    importance: 6,
    metadata: operatorMeta({
      source: "vandor-operator",
      issueKey: input.issueKey,
    }),
    mergeSimilar: true,
  });
}
