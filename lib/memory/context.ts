import "server-only";

import type { MemoryCategory } from "@/lib/db/schema";
import type { MemorySettings } from "@/lib/settings/types";
import {
  listRecentMemories,
  type MemoryRecord,
  searchMemories,
  touchMemories,
} from "./queries";
import { scoreMemory } from "./scoring";

export async function buildMemoryContext({
  userId,
  query,
  memorySettings,
  includeVisual = true,
}: {
  userId: string;
  query: string;
  memorySettings?: MemorySettings;
  includeVisual?: boolean;
}): Promise<string> {
  if (!process.env.POSTGRES_URL || !process.env.OPENROUTER_API_KEY) {
    return "";
  }

  if (memorySettings && !memorySettings.enabled) {
    return "";
  }

  if (memorySettings && !memorySettings.injectInPrompt) {
    return "";
  }

  const categories = memorySettings?.enabledCategories;
  const semanticLimit = memorySettings?.semanticSearchLimit ?? 14;
  const recentLimit = memorySettings?.recentMemoriesLimit ?? 10;
  const minSim = memorySettings?.minSimilarity ?? 0.68;

  const [semantic, recent] = await Promise.all([
    searchMemories({
      userId,
      query,
      limit: semanticLimit,
      minSimilarity: Math.min(minSim, 0.62),
      includeVisual,
      enabledCategories: categories as Record<MemoryCategory, boolean> | undefined,
    }),
    listRecentMemories({
      userId,
      limit: recentLimit,
      includeVisual,
      enabledCategories: categories as Record<MemoryCategory, boolean> | undefined,
    }),
  ]);

  const recentIds = new Set(recent.map((r) => r.id));
  const seen = new Set<string>();
  const candidates: { record: MemoryRecord; score: number }[] = [];

  for (const m of [...semantic, ...recent]) {
    const key = m.content.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      record: m,
      score: scoreMemory(m, { isRecentList: recentIds.has(m.id) }),
    });
  }

  if (candidates.length === 0) {
    return "";
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 16);

  touchMemories({
    userId,
    memoryIds: top.map((t) => t.record.id),
  }).catch(() => null);

  const byCategory = new Map<string, MemoryRecord[]>();
  for (const { record } of top) {
    const list = byCategory.get(record.category) ?? [];
    list.push(record);
    byCategory.set(record.category, list);
  }

  const categoryOrder = [
    "preference",
    "goal",
    "person",
    "instruction",
    "event",
    "fact",
  ];
  const sortedCategories = [...byCategory.keys()].sort(
    (a, b) =>
      (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) -
      (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b))
  );

  const sections = sortedCategories.map((cat) => {
    const items = (byCategory.get(cat) ?? [])
      .map((m) => `- ${m.content}`)
      .join("\n");
    return `### ${cat}\n${items}`;
  });

  return `## Long-term memory (VANDOR Memory v2)
Use these facts naturally. Do not say "according to my memory" unless asked.
Reference them only when relevant to the current message.
When the user says "ingat" / "remember", call saveMemory immediately with high importance.

${sections.join("\n\n")}`;
}
