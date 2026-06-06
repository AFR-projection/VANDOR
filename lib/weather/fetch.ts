import "server-only";

import { isUserLocationPhrase } from "./location-phrases";

export type WeatherPanelPayload = {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone: string;
  timezone_abbreviation?: string;
  elevation?: number;
  cityName?: string;
  current_units: {
    time: string;
    interval: string;
    temperature_2m: string;
  };
  current: {
    time: string;
    interval: number;
    temperature_2m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
  };
  hourly_units?: {
    time: string;
    temperature_2m: string;
  };
  daily: {
    sunrise: string[];
    sunset: string[];
  };
  daily_units?: {
    sunrise: string;
    sunset: string;
  };
};

async function geocodeCity(
  city: string
): Promise<{ latitude: number; longitude: number; name: string } | null> {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string }>;
    };
    const hit = data.results?.[0];
    if (!hit) return null;
    return hit;
  } catch {
    return null;
  }
}

export async function fetchWeatherPanelData(input: {
  latitude?: number;
  longitude?: number;
  /** Nama kota eksplisit — akan di-geocode jika koordinat tidak ada. */
  city?: string;
  /** Label tampilan saat pakai koordinat IP (mis. kota dari geo). */
  locationLabel?: string;
}): Promise<WeatherPanelPayload | { error: string }> {
  let latitude = input.latitude;
  let longitude = input.longitude;
  let cityName = input.city?.trim();
  const locationLabel = input.locationLabel?.trim();

  if (cityName && isUserLocationPhrase(cityName)) {
    cityName = undefined;
  }

  const hasCoords =
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0);

  if (cityName && !hasCoords) {
    const coords = await geocodeCity(cityName);
    if (!coords) {
      return { error: `Kota "${cityName}" tidak ditemukan.` };
    }
    latitude = coords.latitude;
    longitude = coords.longitude;
    cityName = coords.name;
  }

  const resolvedHasCoords =
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0);

  if (!resolvedHasCoords) {
    return {
      error:
        "Lokasi tidak tersedia. Sebutkan kota (mis. cuaca di Jakarta) atau izinkan deteksi lokasi.",
    };
  }

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
  );

  if (!response.ok) {
    return { error: "Gagal mengambil data cuaca." };
  }

  const data = (await response.json()) as WeatherPanelPayload;
  data.cityName = cityName ?? locationLabel ?? data.cityName;
  return data;
}
