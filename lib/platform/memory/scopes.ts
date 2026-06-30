import { parseMemoryMetadata } from "@/lib/memory/metadata";
import type { MemoryRecord } from "@/lib/memory/queries";
import type { MemoryScope, PlatformAgentId } from "../core/types";
import { MEMORY_SCOPES } from "../core/types";

const PROJECT_CATEGORIES = new Set(["goal", "instruction"]);

export type PriorStepMemory = {
  stepKey: string;
  agentId: PlatformAgentId;
  output: Record<string, unknown>;
};

export function isValidMemoryScope(value: string): value is MemoryScope {
  return (MEMORY_SCOPES as readonly string[]).includes(value);
}

export function readRecordPlatformScope(
  record: MemoryRecord
): MemoryScope | null {
  const meta = parseMemoryMetadata(record.metadata);
  const scope = meta.platformScope;
  if (scope && isValidMemoryScope(scope)) {
    return scope;
  }
  return null;
}

export function memoryRecordMatchesScope(
  record: MemoryRecord,
  scope: MemoryScope,
  chatId: string | null
): boolean {
  const tagged = readRecordPlatformScope(record);

  switch (scope) {
    case "user":
    case "long_term":
      return tagged === null || tagged === "user" || tagged === "long_term";
    case "conversation":
      return chatId !== null && record.sourceChatId === chatId;
    case "project":
      return tagged === "project" || PROJECT_CATEGORIES.has(record.category);
    case "knowledge":
      return tagged === "knowledge";
    case "short_term":
      return false;
    default:
      return false;
  }
}

export function filterMemoriesForScope(
  records: MemoryRecord[],
  scope: MemoryScope,
  chatId: string | null
): MemoryRecord[] {
  if (scope === "short_term") {
    return [];
  }

  const seen = new Set<string>();
  const out: MemoryRecord[] = [];

  for (const record of records) {
    if (!memoryRecordMatchesScope(record, scope, chatId)) {
      continue;
    }
    const key = record.content.toLowerCase().trim();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(record);
  }

  return out;
}

export function formatMemoryRecords(
  records: MemoryRecord[],
  maxItems = 6
): string {
  if (records.length === 0) {
    return "";
  }
  return records
    .slice(0, maxItems)
    .map((r) => `- [${r.importance}/10] ${r.content}`)
    .join("\n");
}

export function formatShortTermMemory(
  priorSteps: PriorStepMemory[],
  runId: string
): string {
  if (priorSteps.length === 0) {
    return "";
  }

  const lines = priorSteps.map((step) => {
    const summary =
      typeof step.output.summary === "string"
        ? step.output.summary
        : typeof step.output.message === "string"
          ? step.output.message
          : JSON.stringify(step.output).slice(0, 160);
    return `- ${step.agentId}/${step.stepKey}: ${summary}`;
  });

  return `Run ${runId.slice(0, 8)} — langkah sebelumnya:\n${lines.join("\n")}`;
}

export function scopeSectionLabel(scope: MemoryScope): string {
  const labels: Record<MemoryScope, string> = {
    short_term: "Konteks run (short-term)",
    long_term: "Memori jangka panjang",
    conversation: "Memori percakapan ini",
    project: "Memori proyek",
    user: "Memori user",
    knowledge: "Basis pengetahuan",
  };
  return labels[scope];
}
