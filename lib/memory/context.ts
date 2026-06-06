import "server-only";

import type { MemoryCategory } from "@/lib/db/schema";
import type { MemorySettings } from "@/lib/settings/types";
import {
  V4_MAX_MEMORY_CONTEXT_CHARS,
  V4_MAX_MEMORY_ITEMS,
} from "@/lib/v4/constants";
import { formatMemoryCategoryHeading } from "./category-labels";
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
  const semanticLimit = Math.min(memorySettings?.semanticSearchLimit ?? 12, 16);
  const recentLimit = Math.min(memorySettings?.recentMemoriesLimit ?? 8, 12);
  const minSim = memorySettings?.minSimilarity ?? 0.65;

  const [semantic, recent] = await Promise.all([
    searchMemories({
      userId,
      query,
      limit: semanticLimit,
      minSimilarity: Math.min(minSim, 0.62),
      includeVisual,
      enabledCategories: categories as
        | Record<MemoryCategory, boolean>
        | undefined,
    }),
    listRecentMemories({
      userId,
      limit: recentLimit,
      includeVisual,
      enabledCategories: categories as
        | Record<MemoryCategory, boolean>
        | undefined,
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
  const top = candidates.slice(0, V4_MAX_MEMORY_ITEMS);

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
      .map((m) => `- [${m.importance}/10] ${m.content}`)
      .join("\n");
    return `### ${formatMemoryCategoryHeading(cat)}\n${items}`;
  });

  const body = `## Memori jangka panjang (ranked — gunakan yang relevan saja)
Personalize jawaban jika cocok; jangan sebut "database memori" kecuali ditanya.
Prioritaskan preferensi & instruksi > fakta umum.

${sections.join("\n\n")}`;

  if (body.length <= V4_MAX_MEMORY_CONTEXT_CHARS) {
    return body;
  }
  return `${body.slice(0, V4_MAX_MEMORY_CONTEXT_CHARS)}\n\n…(memori dipangkas — top ${top.length} paling relevan)`;
}
