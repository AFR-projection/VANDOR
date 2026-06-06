"use client";

import {
  CloudIcon,
  CloudRainIcon,
  ExternalLinkIcon,
  GaugeIcon,
  MapPinIcon,
  ThermometerIcon,
  WindIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildOwmWeatherMapUrl } from "@/lib/weather/map-url";
import { createWindParticleLayer } from "./wind-particle-layer";

type Props = {
  lat: number;
  lon: number;
  label: string;
  hasOwmKey?: boolean;
  fullScreen?: boolean;
  initialZoom?: number;
};

type WeatherLayerId =
  | "temp_new"
  | "wind_new"
  | "precipitation_new"
  | "clouds_new"
  | "pressure_new";

const LAYERS: Array<{
  id: WeatherLayerId;
  label: string;
  icon: typeof ThermometerIcon;
  legend?: { gradient: string; min: string; max: string; title: string };
}> = [
  {
    id: "temp_new",
    label: "Suhu",
    icon: ThermometerIcon,
    legend: {
      title: "Suhu °C",
      gradient:
        "linear-gradient(to right, #208cec, #23dddd, #c2ff28, #fff028, #fc8014)",
      min: "0°",
      max: "30°+",
    },
  },
  {
    id: "wind_new",
    label: "Angin",
    icon: WindIcon,
    legend: {
      title: "Kecepatan angin",
      gradient: "linear-gradient(to right, #ffffff, #eececc, #b364bc, #4600af)",
      min: "lemah",
      max: "kuat",
    },
  },
  {
    id: "precipitation_new",
    label: "Hujan",
    icon: CloudRainIcon,
    legend: {
      title: "Curah hujan",
      gradient: "linear-gradient(to right, #fef9ca, #93f57d, #eb4726, #090a08)",
      min: "ringan",
      max: "lebat",
    },
  },
  {
    id: "clouds_new",
    label: "Awan",
    icon: CloudIcon,
    legend: {
      title: "Tutupan awan",
      gradient: "linear-gradient(to right, transparent, #d2d2d2)",
      min: "0%",
      max: "100%",
    },
  },
  {
    id: "pressure_new",
    label: "Tekanan",
    icon: GaugeIcon,
    legend: {
      title: "Tekanan udara",
      gradient: "linear-gradient(to right, #0073ff, #8de7c7, #f0b800, #c60000)",
      min: "940",
      max: "1060 hPa",
    },
  },
];

const OWM_ATTRIBUTION =
  'Weather &copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>';

function owmV1Tile(layer: string): string {
  return `/api/weather/tile?v=1&layer=${layer}&z={z}&x={x}&y={y}`;
}

const OWM_TILE_OPTS = {
  maxNativeZoom: 12,
  maxZoom: 16,
  opacity: 0.78,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 1,
} as const;

export function WeatherOwmMap({
  lat,
  lon,
  label,
  hasOwmKey = true,
  fullScreen = false,
  initialZoom = 10,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const weatherLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const windLayerRef = useRef<import("leaflet").Layer | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<WeatherLayerId>("temp_new");
  const [windParticles, setWindParticles] = useState(true);

  const mapPageUrl = buildOwmWeatherMapUrl(lat, lon, label, initialZoom);
  const layerMeta = LAYERS.find((l) => l.id === activeLayer) ?? LAYERS[0];

  const attachWindParticles = useCallback(
    async (
      map: import("leaflet").Map,
      centerLat: number,
      centerLon: number
    ) => {
      windLayerRef.current?.remove();
      windLayerRef.current = null;

      if (!windParticles) return;

      try {
        const span = Math.max(2, 6 - map.getZoom() * 0.35);
        const res = await fetch(
          `/api/weather/wind-grid?lat=${centerLat}&lon=${centerLon}&span=${span}&n=7`
        );
        if (!res.ok) return;
        const grid = (await res.json()) as Parameters<
          typeof createWindParticleLayer
        >[0];
        const layer = createWindParticleLayer(grid);
        layer.addTo(map);
        windLayerRef.current = layer;
      } catch {
        /* animasi opsional */
      }
    },
    [windParticles]
  );

  const setWeatherLayer = useCallback(
    async (map: import("leaflet").Map, layerId: WeatherLayerId) => {
      const L = await import("leaflet");
      weatherLayerRef.current?.remove();
      weatherLayerRef.current = L.tileLayer(owmV1Tile(layerId), {
        ...OWM_TILE_OPTS,
        attribution: OWM_ATTRIBUTION,
      });
      weatherLayerRef.current.addTo(map);
    },
    []
  );

  useEffect(() => {
    if (!hasOwmKey) return;

    let cancelled = false;

    async function mount() {
      if (!containerRef.current) return;

      try {
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");

        if (cancelled || !containerRef.current) return;

        mapRef.current?.remove();
        mapRef.current = null;
        weatherLayerRef.current = null;
        windLayerRef.current = null;

        const map = L.map(containerRef.current, {
          center: [lat, lon],
          zoom: initialZoom,
          minZoom: 4,
          maxZoom: 16,
          zoomControl: true,
          scrollWheelZoom: fullScreen,
        });

        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; OSM &copy; <a href="https://carto.com/">CARTO</a>',
          }
        ).addTo(map);

        await setWeatherLayer(map, activeLayer);
        await attachWindParticles(map, lat, lon);

        L.circleMarker([lat, lon], {
          radius: fullScreen ? 10 : 8,
          color: "#ffffff",
          fillColor: "#ea580c",
          fillOpacity: 1,
          weight: 2.5,
        })
          .bindTooltip(label, { permanent: false, direction: "top" })
          .addTo(map);

        mapRef.current = map;
        map.setView([lat, lon], initialZoom, { animate: false });
        requestAnimationFrame(() => map.invalidateSize());
        setReady(true);
      } catch {
        if (!cancelled) {
          setError("Peta cuaca tidak bisa dimuat.");
        }
      }
    }

    void mount();

    return () => {
      cancelled = true;
      windLayerRef.current?.remove();
      weatherLayerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [
    attachWindParticles,
    fullScreen,
    hasOwmKey,
    initialZoom,
    lat,
    lon,
    label,
    setWeatherLayer,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    void setWeatherLayer(map, activeLayer);
  }, [activeLayer, ready, setWeatherLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    void attachWindParticles(map, lat, lon);
  }, [attachWindParticles, lat, lon, ready, windParticles]);

  if (!hasOwmKey) {
    return (
      <div className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white/60 text-xs">
        Peta cuaca butuh OPENWEATHERMAP_API_KEY di .env.local
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white/70 text-xs">
        {error}
      </div>
    );
  }

  const mapHeight = fullScreen
    ? "min-h-[calc(100dvh-8rem)]"
    : "h-[240px] sm:h-[280px]";

  return (
    <div className="relative overflow-hidden rounded-xl border border-black/10 bg-[#eef2f6]">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-white/95 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-800">
          <MapPinIcon className="size-3.5 shrink-0 text-[#ea580c]" />
          <span className="truncate font-medium">{label}</span>
        </div>
        {fullScreen ? null : (
          <a
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#ea580c]/15 px-2 py-1 text-[11px] font-medium text-[#c2410c]"
            href={mapPageUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Layar penuh
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>

      <div className={`relative w-full ${mapHeight}`}>
        <div className="absolute inset-0" ref={containerRef} />

        {ready ? (
          <>
            <div className="absolute top-2 left-2 z-[1000] flex flex-col gap-1 rounded-lg bg-zinc-900/85 p-1 shadow-lg backdrop-blur-sm">
              {LAYERS.map(({ id, label: layerLabel, icon: Icon }) => (
                <button
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                    activeLayer === id
                      ? "bg-[#ea580c] text-white"
                      : "text-white/80 hover:bg-white/10"
                  }`}
                  key={id}
                  onClick={() => setActiveLayer(id)}
                  type="button"
                >
                  <Icon className="size-3.5 shrink-0" />
                  {layerLabel}
                </button>
              ))}
              <button
                className={`mt-0.5 flex items-center justify-between gap-2 rounded-md border border-white/15 px-2 py-1.5 text-[10px] ${
                  windParticles ? "bg-white/15 text-white" : "text-white/50"
                }`}
                onClick={() => setWindParticles((v) => !v)}
                type="button"
              >
                <span>Partikel angin</span>
                <span
                  className={`size-2 rounded-full ${windParticles ? "bg-emerald-400" : "bg-zinc-500"}`}
                />
              </button>
            </div>

            {layerMeta.legend ? (
              <div className="absolute bottom-2 left-2 z-[1000] rounded-md bg-white/92 px-2 py-1.5 shadow-md">
                <p className="mb-1 text-[9px] font-medium text-zinc-600">
                  {layerMeta.legend.title}
                </p>
                <div
                  className="h-2 w-32 rounded-sm"
                  style={{ background: layerMeta.legend.gradient }}
                />
                <div className="mt-0.5 flex w-32 justify-between text-[8px] text-zinc-500">
                  <span>{layerMeta.legend.min}</span>
                  <span>{layerMeta.legend.max}</span>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#eef2f6] text-zinc-500 text-xs">
            Memuat peta cuaca…
          </div>
        )}
      </div>

      <p className="border-t border-black/10 bg-white/80 px-3 py-1.5 text-[10px] text-zinc-500">
        OpenWeatherMap · layer realtime · animasi angin GFS · {lat.toFixed(3)}°,{" "}
        {lon.toFixed(3)}°
      </p>
    </div>
  );
}
