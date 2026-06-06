/** Halaman peta cuaca VANDOR — koordinat dari query, bukan geolokasi browser. */
export function buildOwmWeatherMapUrl(
  lat: number,
  lon: number,
  label?: string,
  zoom = 10
): string {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    z: String(zoom),
  });
  if (label?.trim()) {
    params.set("label", label.trim());
  }
  return `/weather-map?${params.toString()}`;
}

/** Derajat tile Web Mercator (z/x/y). */
export function latLonToTile(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number; xFrac: number; yFrac: number } {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y, xFrac: x - Math.floor(x), yFrac: y - Math.floor(y) };
}
