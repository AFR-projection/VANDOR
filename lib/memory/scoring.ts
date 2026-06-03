import type { MemoryRecord } from "./queries";
import { daysSince, parseMemoryMetadata } from "./metadata";

const CATEGORY_WEIGHT: Record<string, number> = {
  preference: 1.25,
  goal: 1.2,
  person: 1.15,
  instruction: 1.15,
  event: 1.05,
  fact: 1.0,
};

/** Recency decay — stale memories rank lower unless high importance. */
function recencyFactor(record: MemoryRecord): number {
  const meta = parseMemoryMetadata(record.metadata);
  const ref = meta.lastAccessedAt ?? record.updatedAt?.toISOString();
  const days = daysSince(ref);
  if (days <= 3) return 1;
  if (days <= 14) return 0.92;
  if (days <= 45) return 0.82;
  if (days <= 120) return 0.7;
  return 0.55;
}

function reuseBoost(record: MemoryRecord): number {
  const count = parseMemoryMetadata(record.metadata).accessCount ?? 0;
  return Math.min(0.22, Math.log1p(count) * 0.06);
}

export function scoreMemory(
  record: MemoryRecord,
  opts: { isRecentList?: boolean } = {}
): number {
  const sim = record.similarity ?? 0;
  const importance = (record.importance ?? 5) / 10;
  const recencyBoost = opts.isRecentList ? 0.12 : 0;
  const categoryMul = CATEGORY_WEIGHT[record.category] ?? 1;
  const base = (sim * 0.62 + importance * 0.38 + recencyBoost) * categoryMul;
  return base * recencyFactor(record) + reuseBoost(record);
}
