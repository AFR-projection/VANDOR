import "server-only";

type CacheEntry<T> = { value: T; expiresAt: number };

const weatherCache = new Map<string, CacheEntry<Record<string, unknown>>>();

const WEATHER_TTL_MS = 15 * 60 * 1000;

function weatherKey(hints: {
  latitude?: string | number;
  longitude?: string | number;
  city?: string;
}): string {
  const lat = Number(hints.latitude);
  const lng = Number(hints.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `geo:${lat.toFixed(2)},${lng.toFixed(2)}`;
  }
  return `city:${(hints.city ?? "jakarta").toLowerCase()}`;
}

export function getCachedWeather(
  hints: Parameters<typeof weatherKey>[0]
): Record<string, unknown> | null {
  const entry = weatherCache.get(weatherKey(hints));
  if (!entry || Date.now() > entry.expiresAt) {
    return null;
  }
  return entry.value;
}

export function setCachedWeather(
  hints: Parameters<typeof weatherKey>[0],
  data: Record<string, unknown>
): void {
  weatherCache.set(weatherKey(hints), {
    value: data,
    expiresAt: Date.now() + WEATHER_TTL_MS,
  });
  if (weatherCache.size > 200) {
    const oldest = weatherCache.keys().next().value;
    if (oldest) weatherCache.delete(oldest);
  }
}
