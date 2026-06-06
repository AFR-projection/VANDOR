import type { Layer, Map } from "leaflet";

type WindGrid = {
  nx: number;
  ny: number;
  lo1: number;
  la1: number;
  dx: number;
  dy: number;
  u: number[];
  v: number[];
};

export function createWindParticleLayer(grid: WindGrid): Layer {
  let map: Map | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let particles: Array<{ lat: number; lng: number; age: number }> = [];
  const count = 380;

  function sampleWind(lat: number, lng: number): { u: number; v: number } {
    const { nx, ny, lo1, la1, dx, dy, u, v } = grid;
    const col = Math.max(0, Math.min(nx - 1, Math.round((lng - lo1) / dx)));
    const row = Math.max(0, Math.min(ny - 1, Math.round((la1 - lat) / dy)));
    const idx = row * nx + col;
    return { u: u[idx] ?? 0, v: v[idx] ?? 0 };
  }

  function spawnRandom(): { lat: number; lng: number; age: number } {
    const bounds = map?.getBounds();
    if (!bounds) {
      return { lat: 0, lng: 0, age: 0 };
    }
    return {
      lat:
        bounds.getSouth() +
        Math.random() * (bounds.getNorth() - bounds.getSouth()),
      lng:
        bounds.getWest() +
        Math.random() * (bounds.getEast() - bounds.getWest()),
      age: Math.random() * 80,
    };
  }

  function resize() {
    if (!map || !canvas) return;
    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    if (particles.length === 0) {
      particles = Array.from({ length: count }, () => spawnRandom());
    }
  }

  function tick() {
    if (!map || !ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      const { u, v } = sampleWind(p.lat, p.lng);
      const speed = Math.hypot(u, v);
      const step = 0.012 * Math.min(2.5, 0.4 + speed * 0.15);

      const nextLat = p.lat + v * step * 0.08;
      const nextLng = p.lng + u * step * 0.08;

      const from = map.latLngToContainerPoint([p.lat, p.lng]);
      const to = map.latLngToContainerPoint([nextLat, nextLng]);

      const alpha = Math.min(0.75, 0.25 + speed * 0.06);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = Math.min(2.2, 0.8 + speed * 0.12);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      p.lat = nextLat;
      p.lng = nextLng;
      p.age += 1;

      const bounds = map.getBounds();
      if (
        p.age > 100 ||
        !bounds.contains([p.lat, p.lng]) ||
        !Number.isFinite(p.lat)
      ) {
        Object.assign(p, spawnRandom());
      }
    }

    raf = requestAnimationFrame(tick);
  }

  return {
    onAdd(m: Map) {
      map = m;
      canvas = document.createElement("canvas");
      canvas.className = "leaflet-wind-particles";
      canvas.style.position = "absolute";
      canvas.style.left = "0";
      canvas.style.top = "0";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "450";
      m.getPanes().overlayPane.appendChild(canvas);
      ctx = canvas.getContext("2d");
      resize();
      m.on("resize move zoom", resize);
      tick();
    },
    onRemove(m: Map) {
      cancelAnimationFrame(raf);
      m.off("resize move zoom", resize);
      canvas?.remove();
      map = null;
      canvas = null;
      ctx = null;
      particles = [];
    },
  } as Layer;
}
