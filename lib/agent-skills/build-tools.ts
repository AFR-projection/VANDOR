import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { executeAgentSkill } from "./runner";
import type {
  AgentSkillRecord,
  HttpApiSkillConfig,
  HttpParamDef,
  SkillExecutionContext,
} from "./types";
import { toSkillToolName } from "./types";

function zodTypeForParam(def: HttpParamDef) {
  let base =
    def.type === "number"
      ? z.number()
      : def.type === "boolean"
        ? z.boolean()
        : z.string();
  if (def.description) {
    base = base.describe(def.description);
  }
  return def.required ? base : base.optional();
}

function buildInputSchema(skill: AgentSkillRecord) {
  switch (skill.skillType) {
    case "http_api": {
      const config = skill.config as HttpApiSkillConfig;
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, def] of Object.entries(config.parameters ?? {})) {
        shape[key] = zodTypeForParam(def);
      }
      if (Object.keys(shape).length === 0) {
        shape.input = z.record(z.unknown()).optional();
      }
      return z.object(shape);
    }
    case "knowledge_base":
      return z.object({
        query: z.string().min(2).describe("Pertanyaan atau topik pencarian"),
      });
    case "web_search":
      return z.object({
        query: z.string().min(2).describe("Kueri pencarian web"),
        news: z.boolean().optional().describe("Mode berita/sports live"),
      });
    case "database":
      return z.object({
        query: z
          .string()
          .min(8)
          .describe("SQL SELECT read-only untuk database"),
      });
    case "workflow":
      return z.object({
        input: z
          .record(z.unknown())
          .optional()
          .describe("Input awal untuk workflow"),
      });
    case "parlay_calculator":
      return z.object({
        ticketId: z
          .string()
          .optional()
          .describe("ID/nomor tiket parlay dari screenshot jika terlihat"),
        betAmount: z
          .number()
          .positive()
          .describe("Nominal taruhan member dalam Rupiah (contoh: 500)"),
        legs: z
          .array(
            z.object({
              label: z.string().optional().describe("Nama tim/pilihan"),
              odds: z.number().positive().describe("Odds asli dari tiket"),
              status: z
                .enum(["W", "WH", "LH", "D", "DRAW", "VOID", "PUSH"])
                .describe("Status hasil: W, WH, LH, atau D/DRAW/VOID"),
            })
          )
          .min(1)
          .describe(
            "Semua pilihan parlay dari gambar tiket — WAJIB baca dari screenshot"
          ),
      });
    default:
      return z.object({ input: z.unknown().optional() });
  }
}

export function buildSkillTool(
  skill: AgentSkillRecord,
  ctx: SkillExecutionContext
) {
  const toolName = toSkillToolName(skill.slug);
  const inputSchema = buildInputSchema(skill);

  return {
    [toolName]: tool({
      description: skill.description,
      inputSchema,
      execute: async (params) => {
        const normalized =
          skill.skillType === "workflow"
            ? ((params as { input?: Record<string, unknown> }).input ?? params)
            : params;
        const result = await executeAgentSkill(
          skill,
          normalized as Record<string, unknown>,
          ctx
        );
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        if (skill.skillType === "parlay_calculator") {
          return {
            ok: true,
            data: result.data,
            agentInstruction:
              "Kartu balasan CS sudah ditampilkan (tombol Salin balasan). JANGAN tulis ulang perhitungan, odds, payout, rincian, atau kesimpulan. Akhiri tanpa teks tambahan.",
          };
        }
        return { ok: true, data: result.data };
      },
    }),
  };
}

export function buildSkillTools(
  skills: AgentSkillRecord[],
  ctx: SkillExecutionContext
): Record<string, ReturnType<typeof tool>> {
  const out: Record<string, ReturnType<typeof tool>> = {};
  for (const skill of skills) {
    Object.assign(out, buildSkillTool(skill, ctx));
  }
  return out;
}

export function buildSkillPromptLines(skills: AgentSkillRecord[]): string[] {
  return skills.map((s) => {
    const name = toSkillToolName(s.slug);
    return `- \`${name}\` — ${s.description}`;
  });
}
