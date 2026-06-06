"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WeatherOwmMap } from "@/components/chat/weather-owm-map";

function WeatherMapContent() {
  const params = useSearchParams();
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const label = params.get("label") ?? "Lokasi cuaca";
  const zoom = Number(params.get("z") ?? "10");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1b2836] px-4 text-white/70 text-sm">
        Koordinat peta tidak valid.
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#1b2836] p-4">
      <WeatherOwmMap
        fullScreen
        hasOwmKey
        initialZoom={Number.isFinite(zoom) ? zoom : 10}
        key={`${lat.toFixed(5)}_${lon.toFixed(5)}`}
        label={label}
        lat={lat}
        lon={lon}
      />
    </div>
  );
}

export default function WeatherMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#1b2836] text-white/50 text-sm">
          Memuat peta…
        </div>
      }
    >
      <WeatherMapContent />
    </Suspense>
  );
}
