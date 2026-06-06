import "server-only";

import { resolveWeatherLocation } from "./geocode";
import { isUserLocationPhrase } from "./location-phrases";
import { buildOwmWeatherMapUrl } from "./map-url";

export type WeatherPanelPayload = {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone: string;
  timezone_abbreviation?: string;
  elevation?: number;
  cityName?: string;
  country?: string;
  condition?: string;
  conditionDescription?: string;
  iconUrl?: string;
  humidity?: number;
  feelsLike?: number;
  windSpeed?: number;
  mapUrl?: string;
  mapLayerAvailable?: boolean;
  provider?: "openweathermap" | "open-meteo";
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

function getOpenWeatherApiKey(): string | null {
  const key = process.env.OPENWEATHERMAP_API_KEY?.trim();
  return key || null;
}

function offsetToTimezone(offsetSeconds: number): string {
  const sign = offsetSeconds >= 0 ? "+" : "-";
  const abs = Math.abs(offsetSeconds);
  const hours = String(Math.floor(abs / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

function unixToLocalIso(unixUtc: number, tzOffsetSec: number): string {
  const localMs = (unixUtc + tzOffsetSec) * 1000;
  const d = new Date(localMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

async function fetchFromOpenWeatherMap(
  latitude: number,
  longitude: number,
  apiKey: string,
  displayName?: string
): Promise<WeatherPanelPayload | { error: string }> {
  const [currentRes, forecastRes] = await Promise.all([
    fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&lang=id&appid=${apiKey}`
    ),
    fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&lang=id&appid=${apiKey}`
    ),
  ]);

  if (!currentRes.ok) {
    return { error: "Gagal mengambil data cuaca (OpenWeatherMap)." };
  }

  const current = (await currentRes.json()) as {
    coord: { lat: number; lon: number };
    weather: Array<{ main: string; description: string; icon: string }>;
    main: {
      temp: number;
      feels_like: number;
      humidity: number;
      temp_min: number;
      temp_max: number;
    };
    wind?: { speed: number };
    dt: number;
    timezone: number;
    name: string;
    sys: { sunrise: number; sunset: number; country?: string };
  };

  const tzOffset = current.timezone ?? 0;
  const weather = current.weather[0];
  const icon = weather?.icon ?? "01d";

  let hourlyTimes: string[] = [];
  let hourlyTemps: number[] = [];

  if (forecastRes.ok) {
    const forecast = (await forecastRes.json()) as {
      list: Array<{ dt: number; main: { temp: number } }>;
      city?: { sunrise: number; sunset: number };
    };
    const nowSec = current.dt;
    const upcoming = forecast.list
      .filter((item) => item.dt >= nowSec)
      .slice(0, 8);
    hourlyTimes = upcoming.map((item) => unixToLocalIso(item.dt, tzOffset));
    hourlyTemps = upcoming.map((item) => item.main.temp);
  }

  if (hourlyTimes.length === 0) {
    hourlyTimes = [unixToLocalIso(current.dt, tzOffset)];
    hourlyTemps = [current.main.temp];
  }

  const sunrise = current.sys.sunrise;
  const sunset = current.sys.sunset;

  return {
    latitude,
    longitude,
    timezone: offsetToTimezone(tzOffset),
    utc_offset_seconds: tzOffset,
    cityName: displayName ?? current.name,
    country: current.sys.country,
    condition: weather?.main,
    conditionDescription: weather?.description,
    iconUrl: `https://openweathermap.org/img/wn/${icon}@2x.png`,
    humidity: current.main.humidity,
    feelsLike: current.main.feels_like,
    windSpeed: current.wind?.speed,
    mapUrl: buildOwmWeatherMapUrl(latitude, longitude, displayName),
    mapLayerAvailable: true,
    provider: "openweathermap",
    current_units: {
      time: "iso8601",
      interval: "seconds",
      temperature_2m: "°C",
    },
    current: {
      time: unixToLocalIso(current.dt, tzOffset),
      interval: 600,
      temperature_2m: current.main.temp,
    },
    hourly: {
      time: hourlyTimes,
      temperature_2m: hourlyTemps,
    },
    hourly_units: {
      time: "iso8601",
      temperature_2m: "°C",
    },
    daily: {
      sunrise: [unixToLocalIso(sunrise, tzOffset)],
      sunset: [unixToLocalIso(sunset, tzOffset)],
    },
    daily_units: {
      sunrise: "iso8601",
      sunset: "iso8601",
    },
  };
}

async function fetchFromOpenMeteo(
  latitude: number,
  longitude: number,
  displayName?: string
): Promise<WeatherPanelPayload | { error: string }> {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
  );

  if (!response.ok) {
    return { error: "Gagal mengambil data cuaca." };
  }

  const data = (await response.json()) as WeatherPanelPayload;
  data.latitude = latitude;
  data.longitude = longitude;
  data.cityName = displayName ?? data.cityName;
  data.provider = "open-meteo";
  data.mapUrl = buildOwmWeatherMapUrl(latitude, longitude, displayName);
  data.mapLayerAvailable = Boolean(getOpenWeatherApiKey());
  return data;
}

async function resolveCoordinates(input: {
  city?: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  apiKey: string | null;
}): Promise<
  | {
      latitude: number;
      longitude: number;
      displayName?: string;
      country?: string;
    }
  | { error: string }
> {
  const cityName = input.city?.trim();

  if (cityName && !isUserLocationPhrase(cityName)) {
    const coords = await resolveWeatherLocation({
      query: cityName,
      apiKey: input.apiKey,
    });
    if (coords) {
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
        displayName: coords.displayName,
        country: coords.country,
      };
    }
    return {
      error: `Lokasi "${cityName}" tidak ditemukan. Coba sebut nama kecamatan/kota yang lebih umum (mis. Medan, Deli Serdang).`,
    };
  }

  const lat = input.latitude;
  const lng = input.longitude;
  const hasCoords =
    lat !== undefined &&
    lng !== undefined &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0);

  if (hasCoords) {
    return {
      latitude: lat,
      longitude: lng,
      displayName: input.locationLabel?.trim() || undefined,
    };
  }

  return {
    error:
      "Lokasi tidak tersedia. Sebutkan kota (mis. cuaca di Jakarta) atau izinkan deteksi lokasi.",
  };
}

export async function fetchWeatherPanelData(input: {
  latitude?: number;
  longitude?: number;
  /** Nama kota eksplisit — akan di-geocode; koordinat IP diabaikan jika kota ada. */
  city?: string;
  /** Label tampilan saat pakai koordinat IP (mis. kota dari geo). */
  locationLabel?: string;
}): Promise<WeatherPanelPayload | { error: string }> {
  const apiKey = getOpenWeatherApiKey();
  const resolved = await resolveCoordinates({
    city: input.city,
    latitude: input.latitude,
    longitude: input.longitude,
    locationLabel: input.locationLabel,
    apiKey,
  });

  if ("error" in resolved) {
    return resolved;
  }

  const { latitude, longitude, displayName, country } = resolved;

  let result: WeatherPanelPayload | { error: string };
  if (apiKey) {
    result = await fetchFromOpenWeatherMap(
      latitude,
      longitude,
      apiKey,
      displayName
    );
  } else {
    result = await fetchFromOpenMeteo(latitude, longitude, displayName);
  }

  if ("error" in result) {
    return result;
  }

  result.latitude = latitude;
  result.longitude = longitude;
  result.mapUrl = buildOwmWeatherMapUrl(latitude, longitude, displayName);
  if (country) {
    result.country = country;
  }
  return result;
}
