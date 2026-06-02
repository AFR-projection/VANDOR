import "server-only";

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
