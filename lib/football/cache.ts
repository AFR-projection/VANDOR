type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const store = new Map<string, CacheEntry>();

export function getFootballCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setFootballCache(
  key: string,
  data: unknown,
  ttlMs: number
): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Reset untuk unit test. */
export function resetFootballCacheForTests(): void {
  store.clear();
}
