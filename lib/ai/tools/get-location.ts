import { tool } from "ai";
import { z } from "zod";
import type { IpGeo } from "@/lib/security/geo";

export function makeGetLocation(geo: IpGeo | null) {
  return tool({
    description:
      "Get the user's approximate location based on IP geolocation. Returns city, country, lat/lon, and timezone. Use when the user asks 'where am I', 'my location', or when needing to default to their location for weather/time/local info.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!geo) {
        return {
          available: false,
          note: "Location not available — IP geolocation failed or running locally.",
        };
      }
      return {
        available: true,
        city: geo.city,
        country: geo.country,
        countryCode: geo.countryCode,
        region: geo.region,
        latitude: geo.latitude,
        longitude: geo.longitude,
        timezone: geo.timezone,
        source: "ip_geolocation",
      };
    },
  });
}
