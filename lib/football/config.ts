import "server-only";

import { getExtraSecretsDecrypted } from "@/lib/settings/secrets-queries";

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

/** TTL cache — hemat quota (free plan ~100 req/hari). */
export const FOOTBALL_CACHE_TTL_MS = {
  live: 60_000,
  fixtures: 5 * 60_000,
  standings: 6 * 60 * 60_000,
  teams: 24 * 60 * 60_000,
  default: 10 * 60_000,
} as const;

export async function getApiFootballApiKey(
  userId?: string | null
): Promise<string | null> {
  if (userId) {
    const extra = await getExtraSecretsDecrypted(userId);
    const fromDb = extra.apiFootballApiKey?.trim();
    if (fromDb) {
      return fromDb;
    }
  }
  return (
    process.env.API_FOOTBALL_KEY?.trim() ||
    process.env.APISPORTS_KEY?.trim() ||
    null
  );
}

export function isApiFootballConfigured(
  key: string | null | undefined
): key is string {
  return Boolean(key?.trim());
}
