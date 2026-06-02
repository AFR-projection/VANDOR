import { tool } from "ai";
import { z } from "zod";

export const getCurrentTime = tool({
  description:
    "Get the current real-world date and time. Use whenever the user asks 'what time is it', 'jam berapa', 'tanggal hari ini', or anything time-sensitive. Defaults to user's timezone if available.",
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe(
        "IANA timezone like 'Asia/Jakarta', 'America/New_York'. Defaults to Asia/Jakarta."
      ),
  }),
  execute: async ({ timezone }) => {
    const tz = timezone ?? "Asia/Jakarta";
    const now = new Date();
    try {
      const formatted = new Intl.DateTimeFormat("id-ID", {
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "long",
      }).format(now);
      const dayName = new Intl.DateTimeFormat("id-ID", {
        timeZone: tz,
        weekday: "long",
      }).format(now);

      return {
        timezone: tz,
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        formatted,
        day: dayName,
      };
    } catch {
      return {
        timezone: "UTC",
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        formatted: now.toUTCString(),
        day: now.toLocaleDateString("en-US", { weekday: "long" }),
        error: `Invalid timezone "${tz}", fell back to UTC.`,
      };
    }
  },
});
