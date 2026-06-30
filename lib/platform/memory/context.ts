import type { MemoryScope, PlatformAgentId } from "../core/types";
import { loadKnowledgeSnippets, loadScopedUserMemories } from "./load";
import {
  filterMemoriesForScope,
  formatMemoryRecords,
  formatShortTermMemory,
  type PriorStepMemory,
  scopeSectionLabel,
} from "./scopes";
import type { AgentMemoryPack } from "./types";

export type { AgentMemoryPack } from "./types";
export { readAgentMemoryPack } from "./types";

const MAX_CONTEXT_CHARS = 3200;

export async function buildAgentMemoryContext(input: {
  userId: string;
  chatId: string | null;
  runId: string;
  agentId: PlatformAgentId;
  scopes: MemoryScope[];
  query: string;
  priorSteps?: PriorStepMemory[];
}): Promise<AgentMemoryPack> {
  const byScope: Partial<Record<MemoryScope, string>> = {};
  const uniqueScopes = [...new Set(input.scopes)];
  let itemCount = 0;

  const needsUserMemories = uniqueScopes.some((s) =>
    ["user", "long_term", "conversation", "project", "knowledge"].includes(s)
  );

  const userMemories = needsUserMemories
    ? await loadScopedUserMemories({
        userId: input.userId,
        query: input.query,
      })
    : [];

  for (const scope of uniqueScopes) {
    if (scope === "short_term") {
      const text = formatShortTermMemory(input.priorSteps ?? [], input.runId);
      if (text) {
        byScope.short_term = text;
        itemCount += (input.priorSteps ?? []).length;
      }
      continue;
    }

    if (scope === "knowledge") {
      const kb = await loadKnowledgeSnippets(input.userId);
      const scoped = filterMemoriesForScope(
        userMemories,
        "knowledge",
        input.chatId
      );
      const memoryText = formatMemoryRecords(scoped, 4);
      const combined = [kb, memoryText].filter(Boolean).join("\n");
      if (combined) {
        byScope.knowledge = combined;
        itemCount += scoped.length + (kb ? 1 : 0);
      }
      continue;
    }

    const scoped = filterMemoriesForScope(userMemories, scope, input.chatId);
    const text = formatMemoryRecords(scoped, scope === "user" ? 8 : 5);
    if (text) {
      byScope[scope] = text;
      itemCount += scoped.length;
    }
  }

  const sections = uniqueScopes
    .map((scope) => {
      const body = byScope[scope];
      if (!body) {
        return null;
      }
      return `### ${scopeSectionLabel(scope)}\n${body}`;
    })
    .filter(Boolean);

  let context = "";
  if (sections.length > 0) {
    context = `## Memori agent (${input.agentId})\nScope: ${uniqueScopes.join(", ")}\n\n${sections.join("\n\n")}`;
    if (context.length > MAX_CONTEXT_CHARS) {
      context = `${context.slice(0, MAX_CONTEXT_CHARS)}\n\n…(memori dipangkas)`;
    }
  }

  return {
    agentId: input.agentId,
    scopes: uniqueScopes,
    byScope,
    context,
    itemCount,
  };
}
