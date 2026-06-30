import "server-only";

import { isSessionActive } from "./gate";

type CacheEntry = {
  active: boolean;
  expiresAt: number;
};

/** Short TTL — kurangi query Neon di middleware tanpa mengorbankan revoke cepat. */
const SESSION_CACHE_TTL_MS = 8000;

const sessionCache = new Map<string, CacheEntry>();

export function invalidateGateSessionCache(sid?: string): void {
  if (sid) {
    sessionCache.delete(sid);
    return;
  }
  sessionCache.clear();
}

export async function isSessionActiveCached(sid: string): Promise<boolean> {
  const now = Date.now();
  const hit = sessionCache.get(sid);
  if (hit && hit.expiresAt > now) {
    return hit.active;
  }

  const active = await isSessionActive(sid);
  sessionCache.set(sid, {
    active,
    expiresAt: now + SESSION_CACHE_TTL_MS,
  });
  return active;
}

const lastTouchAt = new Map<string, number>();
const TOUCH_DEBOUNCE_MS = 30_000;

/** Debounce touchSession — hindari write DB setiap navigasi/API call. */
export function shouldTouchGateSession(sid: string): boolean {
  const now = Date.now();
  const last = lastTouchAt.get(sid) ?? 0;
  if (now - last < TOUCH_DEBOUNCE_MS) {
    return false;
  }
  lastTouchAt.set(sid, now);
  return true;
}
