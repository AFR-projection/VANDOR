import { tool } from "ai";
import { z } from "zod";
import { fetchWeatherPanelData } from "@/lib/weather/fetch";

export const getWeather = tool({
  description:
    "Get the current weather at a location. You can provide either coordinates or a city name.",
  inputSchema: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    city: z
      .string()
      .describe("City name (e.g., 'San Francisco', 'New York', 'London')")
      .optional(),
  }),
  execute: async (input) => {
    const result = await fetchWeatherPanelData({
      latitude: input.latitude,
      longitude: input.longitude,
      city: input.city,
    });
    return result;
  },
});
