import { listKbDocuments } from "@/lib/agent-skills/queries";
import {
  listRecentMemories,
  type MemoryRecord,
  searchMemories,
} from "@/lib/memory/queries";

export async function loadScopedUserMemories(input: {
  userId: string;
  query: string;
  semanticLimit?: number;
  recentLimit?: number;
}): Promise<MemoryRecord[]> {
  if (!process.env.POSTGRES_URL) {
    return [];
  }

  const semanticLimit = input.semanticLimit ?? 10;
  const recentLimit = input.recentLimit ?? 8;
  const query = input.query.trim();

  const [semantic, recent] = await Promise.all([
    query.length >= 2
      ? searchMemories({
          userId: input.userId,
          query,
          limit: semanticLimit,
          minSimilarity: 0.62,
        })
      : Promise.resolve([]),
    listRecentMemories({
      userId: input.userId,
      limit: recentLimit,
    }),
  ]);

  const seen = new Set<string>();
  const merged: MemoryRecord[] = [];

  for (const record of [...semantic, ...recent]) {
    const key = record.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(record);
  }

  return merged;
}

export async function loadKnowledgeSnippets(userId: string): Promise<string> {
  if (!process.env.POSTGRES_URL) {
    return "";
  }

  try {
    const docs = await listKbDocuments(userId);
    const ready = docs
      .filter((d) => d.status === "ready" && d.extractedText)
      .slice(0, 4);

    if (ready.length === 0) {
      return "";
    }

    return ready
      .map((doc) => {
        const snippet = (doc.extractedText ?? "").replace(/\s+/g, " ").trim();
        return `- ${doc.fileName}: ${snippet.slice(0, 220)}${snippet.length > 220 ? "…" : ""}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}
