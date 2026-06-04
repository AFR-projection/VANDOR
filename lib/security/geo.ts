import "server-only";

import type { Geo } from "@vercel/functions";
import { geolocation } from "@vercel/functions";
import type { RequestHints } from "@/lib/ai/prompts";
import { getClientIp } from "./gate-edge";

export type IpGeo = {
  ip: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

const PRIVATE_IP =
  /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1|fe80|local|unknown)/i;

function isPrivate(ip: string | null | undefined): boolean {
  if (!ip) {
    return true;
  }
  return PRIVATE_IP.test(ip);
}

/**
 * Look up approximate location from IP. Uses ipapi.co (no key, 1000/day free).
 * If IP is private/local, queries without IP — provider uses the SERVER's
 * outbound IP, which on a personal laptop equals the user's IP.
 */
export async function lookupIpGeo(ip: string | null): Promise<IpGeo | null> {
  const url = isPrivate(ip)
    ? "https://ipapi.co/json/"
    : `https://ipapi.co/${ip}/json/`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "VANDOR/1.0" },
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (data.error) {
      return null;
    }
    return {
      ip: data.ip ?? null,
      city: data.city ?? null,
      country: data.country_name ?? null,
      countryCode: data.country_code ?? null,
      region: data.region ?? null,
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      timezone: data.timezone ?? null,
    };
  } catch {
    return null;
  }
}

function parseCoord(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Merge Vercel edge headers with ipapi.co fallback. */
export function mergeVercelGeo(
  vercelGeo: Geo,
  clientIp: string,
  fallback: IpGeo | null
): IpGeo | null {
  const hasVercel = Boolean(
    vercelGeo.city || vercelGeo.country || vercelGeo.latitude
  );
  if (!hasVercel && !fallback) {
    return null;
  }

  const latitude =
    parseCoord(vercelGeo.latitude) ?? fallback?.latitude ?? null;
  const longitude =
    parseCoord(vercelGeo.longitude) ?? fallback?.longitude ?? null;

  return {
    ip: isPrivate(clientIp) ? (fallback?.ip ?? null) : clientIp,
    city: vercelGeo.city ?? fallback?.city ?? null,
    country: vercelGeo.country ?? fallback?.country ?? null,
    countryCode: vercelGeo.country ?? fallback?.countryCode ?? null,
    region:
      vercelGeo.countryRegion ?? vercelGeo.region ?? fallback?.region ?? null,
    latitude,
    longitude,
    timezone: fallback?.timezone ?? null,
  };
}

/** Client location for chat tools + system prompt (local dev + Vercel). */
export async function resolveClientGeo(request: Request): Promise<{
  geo: IpGeo | null;
  hints: RequestHints;
}> {
  const vercelGeo = geolocation(request);
  const clientIp = getClientIp(request);
  const lookedUp = await lookupIpGeo(isPrivate(clientIp) ? null : clientIp);
  let geo = mergeVercelGeo(vercelGeo, clientIp, lookedUp);

  if (geo && !geo.timezone && !isPrivate(clientIp)) {
    const tzSource = lookedUp?.timezone
      ? lookedUp
      : await lookupIpGeo(clientIp);
    if (tzSource?.timezone) {
      geo = { ...geo, timezone: tzSource.timezone };
    }
  }

  const hints: RequestHints = {
    latitude: geo?.latitude?.toString() ?? vercelGeo.latitude,
    longitude: geo?.longitude?.toString() ?? vercelGeo.longitude,
    city: geo?.city ?? vercelGeo.city,
    country: geo?.countryCode ?? geo?.country ?? vercelGeo.country,
    timezone: geo?.timezone ?? undefined,
  };

  return { geo, hints };
}
