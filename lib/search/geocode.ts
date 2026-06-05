import "server-only";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

import { APP_USER_AGENT } from "@/lib/version";

const USER_AGENT = `${APP_USER_AGENT}; contact@localhost`;

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
  osmUrl: string;
};

type GeocodeHit = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function geocodePlace(
  query: string
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "1",
  });

  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as GeocodeHit[];
    const hit = data[0];
    if (!hit) {
      return null;
    }
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return {
      lat,
      lng,
      displayName: hit.display_name,
      osmUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}`,
    };
  } catch {
    return null;
  }
}
