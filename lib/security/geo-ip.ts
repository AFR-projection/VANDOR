export type GeoIpResult = {
  locationLabel: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

function isLocalIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  return (
    v === "local" ||
    v === "127.0.0.1" ||
    v === "::1" ||
    v.startsWith("192.168.") ||
    v.startsWith("10.") ||
    v.startsWith("172.16.") ||
    v.startsWith("172.17.") ||
    v.startsWith("172.18.") ||
    v.startsWith("172.19.") ||
    v.startsWith("172.2") ||
    v.startsWith("172.30.") ||
    v.startsWith("172.31.")
  );
}

function formatLocation(parts: Array<string | null | undefined>): string {
  const label = parts.filter(Boolean).join(", ");
  return label || "Lokasi tidak diketahui";
}

/** Best-effort geo lookup for login history (no API key). */
export async function lookupGeoIp(ip: string): Promise<GeoIpResult> {
  if (isLocalIp(ip)) {
    return {
      locationLabel: "Jaringan lokal",
      city: null,
      region: null,
      country: null,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,query`,
      { signal: controller.signal, cache: "no-store" }
    );
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error("geo lookup failed");
    }
    const data = (await res.json()) as {
      status?: string;
      country?: string;
      regionName?: string;
      city?: string;
    };
    if (data.status !== "success") {
      return {
        locationLabel: "Lokasi tidak diketahui",
        city: null,
        region: null,
        country: null,
      };
    }
    const city = data.city ?? null;
    const region = data.regionName ?? null;
    const country = data.country ?? null;
    return {
      locationLabel: formatLocation([city, region, country]),
      city,
      region,
      country,
    };
  } catch {
    return {
      locationLabel: "Lokasi tidak diketahui",
      city: null,
      region: null,
      country: null,
    };
  }
}
