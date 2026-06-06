import "server-only";

import { generateText } from "ai";
import { getTitleModel } from "@/lib/ai/providers";
import { geocodePlace } from "@/lib/search/geocode";

export type ResolvedWeatherLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
  country?: string;
};

const ID_REGION_ALIASES: Record<string, string> = {
  "sumatera utara": "North Sumatra",
  sumut: "North Sumatra",
  "sumatera selatan": "South Sumatra",
  sumsel: "South Sumatra",
  "sumatera barat": "West Sumatra",
  sumbar: "West Sumatra",
  "jawa barat": "West Java",
  jabar: "West Java",
  "jawa tengah": "Central Java",
  jateng: "Central Java",
  "jawa timur": "East Java",
  jatim: "East Java",
  "dki jakarta": "Jakarta",
  jakarta: "Jakarta",
  bali: "Bali",
  "kalimantan timur": "East Kalimantan",
  kaltim: "East Kalimantan",
  "sulawesi selatan": "South Sulawesi",
  sulsel: "South Sulawesi",
  papua: "Papua",
  "nusa tenggara timur": "East Nusa Tenggara",
  ntt: "East Nusa Tenggara",
};

function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:check|cek|lihat|tanya|tolong)\s+/i, "")
    .replace(/\s*(?:dong|deh|ya|please|thanks|makasih)\s*$/i, "")
    .trim();
}

function buildGeocodeVariants(raw: string): string[] {
  const base = normalizeQuery(raw);
  if (!base) return [];

  const variants = new Set<string>();
  variants.add(base);
  variants.add(`${base}, Indonesia`);

  const lower = base.toLowerCase();
  for (const [idName, enName] of Object.entries(ID_REGION_ALIASES)) {
    if (!lower.includes(idName)) continue;

    variants.add(base.replace(new RegExp(idName, "i"), enName));
    variants.add(`${base.replace(new RegExp(idName, "i"), enName)}, Indonesia`);

    const placeOnly = base
      .replace(new RegExp(`\\s*${idName}.*$`, "i"), "")
      .trim();
    if (placeOnly.length >= 2 && placeOnly !== base) {
      variants.add(`${placeOnly}, ${enName}, Indonesia`);
      variants.add(`${placeOnly}, Indonesia`);
    }
  }

  if (!/,|\bindonesia\b|\bID\b/i.test(base)) {
    variants.add(`${base}, Indonesia`);
  }

  return [...variants].slice(0, 8);
}

function countryFromDisplayName(displayName: string): string | undefined {
  const parts = displayName.split(",").map((p) => p.trim());
  return parts.at(-1)?.length === 2
    ? parts.at(-1)?.toUpperCase()
    : parts.at(-1);
}

async function geocodeWithOpenWeather(
  query: string,
  apiKey: string
): Promise<ResolvedWeatherLocation | null> {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=3&appid=${apiKey}`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{
      lat: number;
      lon: number;
      name: string;
      country?: string;
      state?: string;
    }>;
    const hit = data[0];
    if (!hit) return null;
    const label = hit.state ? `${hit.name}, ${hit.state}` : hit.name;
    return {
      latitude: hit.lat,
      longitude: hit.lon,
      displayName: label,
      country: hit.country,
    };
  } catch {
    return null;
  }
}

async function geocodeWithOpenMeteo(
  query: string
): Promise<ResolvedWeatherLocation | null> {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=3&language=id&format=json`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        admin1?: string;
        country?: string;
      }>;
    };
    const hit = data.results?.[0];
    if (!hit) return null;
    const label = hit.admin1 ? `${hit.name}, ${hit.admin1}` : hit.name;
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      displayName: label,
      country: hit.country,
    };
  } catch {
    return null;
  }
}

async function geocodeWithNominatim(
  query: string,
  near?: { lat?: number; lng?: number }
): Promise<ResolvedWeatherLocation | null> {
  const hit = await geocodePlace(query, {
    nearLat: near?.lat,
    nearLng: near?.lng,
  });
  if (!hit) return null;
  return {
    latitude: hit.lat,
    longitude: hit.lng,
    displayName: hit.displayName.split(",").slice(0, 3).join(", ").trim(),
    country: countryFromDisplayName(hit.displayName),
  };
}

async function resolveLocationQueryWithLlm(
  userQuery: string
): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return null;
  }

  try {
    const { text } = await generateText({
      model: getTitleModel(),
      system: `You convert informal location phrases into ONE geocoding search query for OpenStreetMap.
Rules:
- Output ONLY the search query, one line, no quotes, no explanation.
- Include place, region/state, and country when possible.
- Use English for country and major region names.
- Prefer the most specific real place (city, town, village, district).
Examples:
"pantai labu sumatera utara" -> Pantai Labu, North Sumatra, Indonesia
"cuaca di ubud" -> Ubud, Bali, Indonesia
"weather near eiffel tower" -> Eiffel Tower, Paris, France`,
      prompt: userQuery.slice(0, 200),
      temperature: 0.1,
    });

    const line = text
      .trim()
      .split("\n")
      .map((l) => l.replace(/^["']|["']$/g, "").trim())
      .find((l) => l.length >= 2);
    return line ?? null;
  } catch {
    return null;
  }
}

async function tryGeocodeQuery(
  query: string,
  input: {
    apiKey: string | null;
    nearLat?: number;
    nearLng?: number;
  }
): Promise<ResolvedWeatherLocation | null> {
  const near = { lat: input.nearLat, lng: input.nearLng };

  const nominatim = await geocodeWithNominatim(query, near);
  if (nominatim) return nominatim;

  if (input.apiKey) {
    const owm = await geocodeWithOpenWeather(query, input.apiKey);
    if (owm) return owm;
  }

  return geocodeWithOpenMeteo(query);
}

export async function resolveWeatherLocation(input: {
  query: string;
  apiKey?: string | null;
  nearLat?: number;
  nearLng?: number;
}): Promise<ResolvedWeatherLocation | null> {
  const apiKey = input.apiKey ?? null;
  const variants = buildGeocodeVariants(input.query);

  for (const variant of variants) {
    const hit = await tryGeocodeQuery(variant, {
      apiKey,
      nearLat: input.nearLat,
      nearLng: input.nearLng,
    });
    if (hit) return hit;
  }

  const llmQuery = await resolveLocationQueryWithLlm(input.query);
  if (llmQuery && !variants.includes(llmQuery)) {
    const hit = await tryGeocodeQuery(llmQuery, {
      apiKey,
      nearLat: input.nearLat,
      nearLng: input.nearLng,
    });
    if (hit) return hit;

    for (const variant of buildGeocodeVariants(llmQuery)) {
      const retry = await tryGeocodeQuery(variant, {
        apiKey,
        nearLat: input.nearLat,
        nearLng: input.nearLng,
      });
      if (retry) return retry;
    }
  }

  return null;
}
