import { NextResponse } from "next/server";

/** Weather Maps 1.0 — tersedia untuk semua API key (dok: openweathermap.org/api/weathermaps) */
const OWM_TILES_V1 = "https://tile.openweathermap.org/map";

/** Weather Maps 2.0 — butuh langganan terpisah (dok: openweathermap.org/api/weather-map-2) */
const OWM_MAPS_V2 = "https://maps.openweathermap.org/maps/2.0/weather";

const V2_TO_V1: Record<string, string> = {
  TA2: "temp_new",
  PR0: "precipitation_new",
  PA0: "precipitation_new",
  CL: "clouds_new",
  WND: "wind_new",
  WS10: "wind_new",
  APM: "pressure_new",
};

const ALLOWED_V2_OPS = new Set(Object.keys(V2_TO_V1));

const ALLOWED_V1_LAYERS = new Set([
  "temp_new",
  "precipitation_new",
  "clouds_new",
  "pressure_new",
  "wind_new",
]);

function clampOpacity(value: string | null, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.1, n));
}

function v1TileUrl(
  apiKey: string,
  layer: string,
  z: string,
  x: string,
  y: string
) {
  return `${OWM_TILES_V1}/${layer}/${z}/${x}/${y}.png?appid=${apiKey}`;
}

function v2TileUrl(
  apiKey: string,
  op: string,
  z: string,
  x: string,
  y: string,
  opacity: number,
  fillBound: boolean
) {
  return `${OWM_MAPS_V2}/${op}/${z}/${x}/${y}?opacity=${opacity}&fill_bound=${fillBound ? "true" : "false"}&appid=${apiKey}`;
}

async function fetchTileImage(url: string): Promise<Response> {
  return fetch(url, { next: { revalidate: 900 } });
}

export async function GET(request: Request) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENWEATHERMAP_API_KEY not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const op = (searchParams.get("op") ?? "TA2").toUpperCase();
  const layerParam = searchParams.get("layer");
  const opacity = clampOpacity(searchParams.get("opacity"), 0.85);
  const fillBound = searchParams.get("fill_bound") !== "0";
  const version = searchParams.get("v") ?? "1";

  if (
    !z ||
    !x ||
    !y ||
    !/^\d+$/.test(z) ||
    !/^\d+$/.test(x) ||
    !/^\d+$/.test(y)
  ) {
    return NextResponse.json(
      { error: "Invalid tile coordinates" },
      { status: 400 }
    );
  }

  const v1Layer =
    layerParam && ALLOWED_V1_LAYERS.has(layerParam)
      ? layerParam
      : (V2_TO_V1[op] ?? "temp_new");

  try {
    let res: Response | null = null;

    if (version === "2" && ALLOWED_V2_OPS.has(op)) {
      res = await fetchTileImage(
        v2TileUrl(apiKey, op, z, x, y, opacity, fillBound)
      );
      if (res.status === 401 || res.status === 403) {
        res = null;
      }
    }

    if (!res?.ok) {
      res = await fetchTileImage(v1TileUrl(apiKey, v1Layer, z, x, y));
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            res.status === 401
              ? "OpenWeatherMap tile unauthorized — periksa API key atau aktifkan Weather Maps di dashboard OWM"
              : "Upstream tile unavailable",
        },
        { status: res.status }
      );
    }

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Tile fetch failed" }, { status: 502 });
  }
}
