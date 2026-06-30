import "server-only";

import { getFootballCache, setFootballCache } from "./cache";
import { API_FOOTBALL_BASE_URL, FOOTBALL_CACHE_TTL_MS } from "./config";
import type { ApiFootballEnvelope } from "./types";

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasApiErrors(errors: ApiFootballEnvelope<unknown>["errors"]): boolean {
  if (!errors) {
    return false;
  }
  if (Array.isArray(errors)) {
    return errors.length > 0;
  }
  return Object.keys(errors).length > 0;
}

function formatApiErrors(
  errors: ApiFootballEnvelope<unknown>["errors"]
): string {
  if (Array.isArray(errors)) {
    return errors.join("; ");
  }
  return Object.values(errors).join("; ");
}

export type FootballClientOptions = {
  apiKey: string;
  cacheTtlMs?: number;
  skipCache?: boolean;
};

export async function footballApiGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  options: FootballClientOptions
): Promise<{ data: ApiFootballEnvelope<T>; cached: boolean }> {
  const url = new URL(path.replace(/^\//, ""), `${API_FOOTBALL_BASE_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const cacheKey = url.toString();
  const ttl = options.cacheTtlMs ?? FOOTBALL_CACHE_TTL_MS.default;

  if (!options.skipCache) {
    const cached = getFootballCache<ApiFootballEnvelope<T>>(cacheKey);
    if (cached) {
      return { data: cached, cached: true };
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-apisports-key": options.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        next: { revalidate: 0 },
      });

      if (response.status === 429) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `API-Football HTTP ${response.status}: ${response.statusText}`
        );
      }

      const body = (await response.json()) as ApiFootballEnvelope<T>;

      if (hasApiErrors(body.errors)) {
        throw new Error(formatApiErrors(body.errors));
      }

      setFootballCache(cacheKey, body, ttl);
      return { data: body, cached: false };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("API-Football request failed");
      if (attempt < MAX_RETRIES - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("API-Football request failed");
}
