import { tool } from "ai";
import { z } from "zod";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
import { APP_USER_AGENT } from "@/lib/version";

const USER_AGENT = `${APP_USER_AGENT}; contact@localhost`;

export type MapMarker = {
  lat: number;
  lng: number;
  label: string;
  kind?: "primary" | "place" | "user";
};

export type ShowMapResult = {
  ok: true;
  query: string;
  displayName: string;
  center: { lat: number; lng: number };
  zoom: number;
  markers: MapMarker[];
  bbox: [number, number, number, number];
  osmUrl: string;
};

type GeocodeHit = {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: [string, string, string, string];
};

async function geocode(
  query: string,
  opts?: { nearLat?: number; nearLng?: number }
): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "1",
  });
  if (opts?.nearLat !== undefined && opts?.nearLng !== undefined) {
    params.set("viewbox", `${opts.nearLng - 0.5},${opts.nearLat + 0.5},${opts.nearLng + 0.5},${opts.nearLat - 0.5}`);
    params.set("bounded", "0");
  }

  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GeocodeHit[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

function bboxFromMarkers(
  markers: MapMarker[],
  padding = 0.02
): [number, number, number, number] {
  const lats = markers.map((m) => m.lat);
  const lngs = markers.map((m) => m.lng);
  const minLat = Math.min(...lats) - padding;
  const maxLat = Math.max(...lats) + padding;
  const minLng = Math.min(...lngs) - padding;
  const maxLng = Math.max(...lngs) + padding;
  return [minLng, minLat, maxLng, maxLat];
}

function zoomForBbox(bbox: [number, number, number, number]): number {
  const span = Math.max(
    Math.abs(bbox[2] - bbox[0]),
    Math.abs(bbox[3] - bbox[1])
  );
  if (span > 8) return 5;
  if (span > 2) return 8;
  if (span > 0.5) return 11;
  if (span > 0.08) return 13;
  if (span > 0.02) return 15;
  return 16;
}

export const showMap = tool({
  description:
    "Show an interactive map in the chat for a place, address, landmark, or area. Use when the user asks where something is, wants directions context, nearby places, 'peta', 'maps', 'lokasi di map', or geographic visualization. Optionally add extra markers for related places (e.g. restaurants near a landmark). Returns coordinates and renders a live OpenStreetMap in the UI.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "Main place to show — city, address, landmark, or area (e.g. 'Monas Jakarta', 'Bandung', 'Jl. Sudirman Jakarta')"
      ),
    extraPlaces: z
      .array(
        z.object({
          query: z.string().min(1).describe("Additional place name to pin"),
          label: z
            .string()
            .optional()
            .describe("Short label for the pin popup"),
        })
      )
      .max(8)
      .optional()
      .describe("Optional extra pins (e.g. nearby cafes, airports, offices)"),
    nearLatitude: z
      .number()
      .optional()
      .describe("Bias geocoding toward this latitude (e.g. user's location)"),
    nearLongitude: z
      .number()
      .optional()
      .describe("Bias geocoding toward this longitude"),
  }),
  execute: async (input) => {
    const main = await geocode(input.query, {
      nearLat: input.nearLatitude,
      nearLng: input.nearLongitude,
    });

    if (!main) {
      return {
        ok: false as const,
        error: `Could not find "${input.query}" on the map. Try a more specific name or spelling.`,
      };
    }

    const centerLat = Number(main.lat);
    const centerLng = Number(main.lon);
    const markers: MapMarker[] = [
      {
        lat: centerLat,
        lng: centerLng,
        label: main.display_name,
        kind: "primary",
      },
    ];

    for (const place of input.extraPlaces ?? []) {
      const hit = await geocode(place.query, {
        nearLat: centerLat,
        nearLng: centerLng,
      });
      if (hit) {
        markers.push({
          lat: Number(hit.lat),
          lng: Number(hit.lon),
          label: place.label ?? hit.display_name,
          kind: "place",
        });
      }
    }

    const bbox = bboxFromMarkers(markers);
    const zoom = zoomForBbox(bbox);

    return {
      ok: true as const,
      query: input.query,
      displayName: main.display_name,
      center: { lat: centerLat, lng: centerLng },
      zoom,
      markers,
      bbox,
      osmUrl: `https://www.openstreetmap.org/?mlat=${centerLat}&mlon=${centerLng}#map=${zoom}/${centerLat}/${centerLng}`,
      embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.join(",")}&layer=mapnik&marker=${centerLat},${centerLng}`,
    } satisfies ShowMapResult & { embedUrl: string };
  },
});
