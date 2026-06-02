import "server-only";

import type { MemoryCategory } from "@/lib/db/schema";
import type { MemorySettings } from "@/lib/settings/types";
import { listRecentMemories, type MemoryRecord, searchMemories } from "./queries";

const CATEGORY_WEIGHT: Record<string, number> = {
  preference: 1.25,
  goal: 1.2,
  person: 1.15,
  instruction: 1.15,
  event: 1.05,
  fact: 1.0,
};

function scoreOf(m: MemoryRecord, isRecent: boolean): number {
  const sim = m.similarity ?? 0;
  const importance = (m.importance ?? 5) / 10;
  const recencyBoost = isRecent ? 0.15 : 0;
  const categoryMul = CATEGORY_WEIGHT[m.category] ?? 1;
  return (sim * 0.65 + importance * 0.35 + recencyBoost) * categoryMul;
}

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
  const semanticLimit = memorySettings?.semanticSearchLimit ?? 12;
  const recentLimit = memorySettings?.recentMemoriesLimit ?? 8;
  const minSim = memorySettings?.minSimilarity ?? 0.72;

  const [semantic, recent] = await Promise.all([
    searchMemories({
      userId,
      query,
      limit: semanticLimit,
      minSimilarity: Math.min(minSim, 0.65),
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
      score: scoreOf(m, recentIds.has(m.id)),
    });
  }

  if (candidates.length === 0) {
    return "";
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 14);

  // Group by category for readability
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

  return `## Long-term memory (VANDOR Memory v1.5)
Use these facts naturally. Do not say "according to my memory" unless asked.
Reference them only when relevant to the current message.

${sections.join("\n\n")}`;
}
