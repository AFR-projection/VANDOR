import { tool } from "ai";
import { z } from "zod";
import { runWebSearch } from "@/lib/search/engine";
import type { WebSearchOutput } from "@/lib/search/types";

export function makeWebSearch(userId: string) {
  return tool({
    description:
      "Search the web for current/live information (scores, prices, news). Use when the user asks for real-time data or when automatic search returned nothing. Prefer English queries for international sports.",
    inputSchema: z.object({
      query: z.string().min(2).describe("The search query"),
      maxResults: z
        .number()
        .int()
        .min(3)
        .max(6)
        .optional()
        .describe("Number of results (default 5)"),
      news: z
        .boolean()
        .optional()
        .describe("Set true for breaking news / sports results"),
    }),
    execute: async ({ query, maxResults, news }): Promise<WebSearchOutput> => {
      return runWebSearch(query, {
        maxResults: maxResults ?? 5,
        userId,
        intents: { news: news ?? false },
      });
    },
  });
}

/** @deprecated Use makeWebSearch(userId) from chat route */
export const webSearch = makeWebSearch("");
