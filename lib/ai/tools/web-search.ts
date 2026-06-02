import { tool } from "ai";
import { z } from "zod";
import { runWebSearch } from "@/lib/search/engine";
import type { WebSearchOutput } from "@/lib/search/types";

export const webSearch = tool({
  description:
    "Search the web for current information. Only use if web search was NOT already provided in system context.",
  inputSchema: z.object({
    query: z.string().min(2).describe("The search query"),
    maxResults: z
      .number()
      .int()
      .min(3)
      .max(5)
      .optional()
      .describe("Number of results (3-5, default 5)"),
  }),
  execute: async ({ query, maxResults }): Promise<WebSearchOutput> => {
    return runWebSearch(query, maxResults ?? 5);
  },
});
