export type MemoryMetadata = {
  visual?: boolean;
  fileName?: string;
  mime?: string;
  url?: string;
  /** Times this memory was injected into a reply context */
  accessCount?: number;
  lastAccessedAt?: string;
  lastRecalledAt?: string;
  mergedFrom?: string[];
  preExtracted?: boolean;
  explicitRemember?: boolean;
  hygieneMerged?: boolean;
};

export function parseMemoryMetadata(raw: unknown): MemoryMetadata {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return raw as MemoryMetadata;
}

export function withAccessBump(meta: MemoryMetadata): MemoryMetadata {
  const now = new Date().toISOString();
  return {
    ...meta,
    accessCount: (meta.accessCount ?? 0) + 1,
    lastAccessedAt: now,
    lastRecalledAt: now,
  };
}

export function daysSince(iso: string | undefined): number {
  if (!iso) return 365;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 365;
  return Math.max(0, (Date.now() - t) / 86_400_000);
}
