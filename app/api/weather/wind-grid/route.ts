import { NextResponse } from "next/server";

/** Grid angin untuk animasi partikel — data current dari Open-Meteo GFS (gratis). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const span = Number(searchParams.get("span") ?? "3");
  const n = Math.min(8, Math.max(4, Number(searchParams.get("n") ?? "6")));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const half = span / 2;
  const lats: number[] = [];
  const lons: number[] = [];

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const latOff = n > 1 ? -half + (span * row) / (n - 1) : 0;
      const lonOff = n > 1 ? -half + (span * col) / (n - 1) : 0;
      lats.push(lat + latOff);
      lons.push(lon + lonOff);
    }
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lats.join(","));
  url.searchParams.set("longitude", lons.join(","));
  url.searchParams.set("current", "wind_speed_10m,wind_direction_10m");
  url.searchParams.set("timezone", "auto");

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 600 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Wind data unavailable" },
        { status: 502 }
      );
    }

    const raw = await res.json();
    const u: number[] = [];
    const v: number[] = [];

    const rows = Array.isArray(raw) ? raw : [raw];
    for (const row of rows) {
      const speed =
        row.current?.wind_speed_10m ?? row.current_weather?.windspeed ?? 0;
      const dir =
        row.current?.wind_direction_10m ??
        row.current_weather?.winddirection ??
        0;
      const { u: uu, v: vv } = speedDirToUV(Number(speed), Number(dir));
      u.push(uu);
      v.push(vv);
    }

    while (u.length < n * n) {
      const lastU = u.at(-1) ?? 0;
      const lastV = v.at(-1) ?? 0;
      u.push(lastU);
      v.push(lastV);
    }

    const lo1 = lon - half;
    const la1 = lat + half;
    const dx = n > 1 ? span / (n - 1) : span;
    const dy = n > 1 ? span / (n - 1) : span;

    return NextResponse.json(
      { nx: n, ny: n, lo1, la1, dx, dy, u, v },
      {
        headers: {
          "Cache-Control": "public, max-age=600, s-maxage=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Wind fetch failed" }, { status: 502 });
  }
}

function speedDirToUV(
  speedMs: number,
  directionDeg: number
): { u: number; v: number } {
  const rad = (directionDeg * Math.PI) / 180;
  return {
    u: -speedMs * Math.sin(rad),
    v: -speedMs * Math.cos(rad),
  };
}
