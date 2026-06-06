import "server-only";

import { parseMemoryMetadata } from "./metadata";
import { listRecentMemories, saveMemory, updateMemory } from "./queries";

/**
 * Ringan — jalan di background setelah batch simpan memori.
 * Merge duplikat hampir identik & turunkan memori usang yang jarang dipakai.
 */
export async function runMemoryHygiene(userId: string): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }

  try {
    const recent = await listRecentMemories({ userId, limit: 40 });
    const seen = new Set<string>();

    for (const row of recent) {
      const key = row.content.toLowerCase().trim().slice(0, 80);
      if (seen.has(key)) {
        await updateMemory({
          userId,
          memoryId: row.id,
          importance: Math.max(1, row.importance - 2),
        }).catch(() => null);
        continue;
      }
      seen.add(key);

      const meta = parseMemoryMetadata(row.metadata);
      const last = meta.lastAccessedAt ?? row.updatedAt?.toISOString();
      if (!last) continue;

      const days =
        (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
      if (days > 200 && row.importance <= 4) {
        await updateMemory({
          userId,
          memoryId: row.id,
          importance: Math.max(1, row.importance - 1),
        }).catch(() => null);
      }
    }

    const pairs = recent.slice(0, 20);
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const a = pairs[i];
        const b = pairs[j];
        if (a.category !== b.category) continue;
        const na = a.content.toLowerCase().trim();
        const nb = b.content.toLowerCase().trim();
        if (na === nb || na.includes(nb) || nb.includes(na)) {
          await saveMemory({
            userId,
            content:
              a.content.length >= b.content.length ? a.content : b.content,
            category: a.category,
            importance: Math.max(a.importance, b.importance),
            mergeSimilar: true,
            metadata: { hygieneMerged: true },
          }).catch(() => null);
        }
      }
    }
  } catch (error) {
    console.error("Memory hygiene failed:", error);
  }
}
