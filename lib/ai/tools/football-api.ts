import { tool } from "ai";
import { z } from "zod";
import { runFootballTool } from "@/lib/football/service";
import type { FootballServiceResult, FootballToolAction } from "@/lib/football/types";

const footballActionSchema = z.enum([
  "live_scores",
  "fixtures_today",
  "fixtures_by_date",
  "standings",
  "team_info",
  "league_info",
  "top_scorers",
  "head_to_head",
  "match_detail",
  "smart_query",
]);

export function makeFootballApi(userId: string) {
  return tool({
    description:
      "Data sepak bola real-time via API-Football: skor live, jadwal, klasemen, info tim/liga, top skor. WAJIB untuk pertanyaan bola/football/soccer/liga. Prefer smart_query jika user tidak spesifik.",
    inputSchema: z.object({
      action: footballActionSchema
        .optional()
        .describe("Jenis query. Default smart_query (infer dari konteks)."),
      query: z
        .string()
        .optional()
        .describe("Pertanyaan atau kata kunci (tim/liga)"),
      date: z
        .string()
        .optional()
        .describe("Tanggal YYYY-MM-DD untuk fixtures_by_date"),
      leagueId: z.number().int().optional(),
      leagueName: z.string().optional(),
      teamId: z.number().int().optional(),
      teamName: z.string().optional(),
      fixtureId: z.number().int().optional(),
      season: z.number().int().optional(),
    }),
    execute: async (input): Promise<FootballServiceResult> => {
      const action = (input.action ?? "smart_query") as FootballToolAction;
      return runFootballTool({
        userId,
        action,
        query: input.query,
        date: input.date,
        leagueId: input.leagueId,
        leagueName: input.leagueName,
        teamId: input.teamId,
        teamName: input.teamName,
        fixtureId: input.fixtureId,
        season: input.season,
      });
    },
  });
}
