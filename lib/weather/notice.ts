import type { WeatherPanelPayload } from "./fetch";

export function weatherDataPart(payload: WeatherPanelPayload): {
  type: "data-weather";
  data: WeatherPanelPayload;
} {
  return { type: "data-weather", data: payload };
}
