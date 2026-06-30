import "server-only";

import { runWebSearch } from "@/lib/search/engine";
import { executeDatabaseSkill, executeHttpApiSkill } from "./executors";
import { searchKnowledgeBase } from "./knowledge-base";
import { calculateMixParlay, type ParlayCalcInput } from "./parlay-calculator";
import { getAgentSkillBySlug, insertSkillLog } from "./queries";
import { checkSkillRateLimit } from "./rate-limit";
import type {
  AgentSkillRecord,
  DatabaseSkillConfig,
  HttpApiSkillConfig,
  KnowledgeBaseSkillConfig,
  SkillExecutionContext,
  SkillExecutionResult,
  WebSearchSkillConfig,
  WorkflowSkillConfig,
} from "./types";

async function runSingleSkill(
  skill: AgentSkillRecord,
  params: Record<string, unknown>,
  ctx: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const rate = await checkSkillRateLimit({
    userId: ctx.userId,
    skillSlug: skill.slug,
    limitPerHour: skill.rateLimitPerHour,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      error: `Rate limit skill '${skill.name}' tercapai (${skill.rateLimitPerHour}/jam)`,
      executionTimeMs: 0,
    };
  }

  let result: SkillExecutionResult;

  switch (skill.skillType) {
    case "http_api":
      result = await executeHttpApiSkill(
        skill.config as HttpApiSkillConfig,
        params,
        ctx
      );
      break;
    case "knowledge_base":
      result = await searchKnowledgeBase({
        userId: ctx.userId,
        query: String(params.query ?? params.q ?? ""),
        config: skill.config as KnowledgeBaseSkillConfig,
      });
      break;
    case "web_search":
      result = await executeWebSearchSkill(
        skill.config as WebSearchSkillConfig,
        params,
        ctx
      );
      break;
    case "database":
      result = await executeDatabaseSkill(
        skill.config as DatabaseSkillConfig,
        params,
        ctx
      );
      break;
    case "workflow":
      result = await executeWorkflowSkill(
        skill.config as WorkflowSkillConfig,
        params,
        ctx
      );
      break;
    case "parlay_calculator":
      result = executeParlayCalculatorSkill(params);
      break;
    default:
      result = {
        ok: false,
        error: `Tipe skill tidak dikenal: ${skill.skillType}`,
        executionTimeMs: 0,
      };
  }

  await insertSkillLog({
    userId: ctx.userId,
    chatId: ctx.chatId,
    skillId: skill.id,
    skillSlug: skill.slug,
    skillName: skill.name,
    request: params,
    response: result.ok ? result.data : { error: result.error },
    executionTimeMs: result.executionTimeMs,
    status: result.ok ? "ok" : "error",
    errorMessage: result.error ?? null,
  });

  return result;
}

function executeParlayCalculatorSkill(
  params: Record<string, unknown>
): SkillExecutionResult {
  const started = Date.now();
  try {
    const legs = params.legs;
    if (!Array.isArray(legs) || legs.length === 0) {
      return {
        ok: false,
        error: "Parameter 'legs' wajib berisi minimal 1 pilihan parlay",
        executionTimeMs: Date.now() - started,
      };
    }
    const betAmount = Number(params.betAmount);
    if (!Number.isFinite(betAmount) || betAmount <= 0) {
      return {
        ok: false,
        error: "Parameter 'betAmount' wajib diisi (nominal taruhan Rupiah)",
        executionTimeMs: Date.now() - started,
      };
    }

    const input: ParlayCalcInput = {
      ticketId:
        typeof params.ticketId === "string" ? params.ticketId : undefined,
      betAmount,
      legs: legs.map((leg, i) => {
        const row = leg as Record<string, unknown>;
        return {
          label: typeof row.label === "string" ? row.label : `Pilihan ${i + 1}`,
          odds: Number(row.odds),
          status: String(
            row.status ?? "W"
          ) as ParlayCalcInput["legs"][number]["status"],
        };
      }),
    };

    const data = calculateMixParlay(input);
    return {
      ok: true,
      data,
      executionTimeMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Perhitungan parlay gagal",
      executionTimeMs: Date.now() - started,
    };
  }
}

async function executeWebSearchSkill(
  config: WebSearchSkillConfig,
  params: Record<string, unknown>,
  ctx: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const started = Date.now();
  const query = String(params.query ?? "").trim();
  if (!query) {
    return {
      ok: false,
      error: "Parameter 'query' wajib diisi",
      executionTimeMs: Date.now() - started,
    };
  }
  try {
    const output = await runWebSearch(query, {
      maxResults: config.maxResults ?? 5,
      userId: ctx.userId,
      intents: { news: config.news ?? false },
    });
    return {
      ok: true,
      data: output,
      executionTimeMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Web search gagal",
      executionTimeMs: Date.now() - started,
    };
  }
}

async function executeWorkflowSkill(
  config: WorkflowSkillConfig,
  params: Record<string, unknown>,
  ctx: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const started = Date.now();
  const stepResults: unknown[] = [];
  let context = { ...params };

  for (const step of config.steps) {
    const skill = await getAgentSkillBySlug(ctx.userId, step.skillSlug);
    if (!skill?.isActive) {
      return {
        ok: false,
        error: `Skill workflow '${step.skillSlug}' tidak ditemukan atau nonaktif`,
        executionTimeMs: Date.now() - started,
      };
    }

    const stepParams: Record<string, unknown> = {};
    if (step.parameterMapping) {
      for (const [target, source] of Object.entries(step.parameterMapping)) {
        if (source.startsWith("$input.")) {
          const key = source.slice(7);
          stepParams[target] = params[key];
        } else if (source.startsWith("$context.")) {
          const key = source.slice(9);
          stepParams[target] = context[key];
        } else {
          stepParams[target] = source;
        }
      }
    } else {
      Object.assign(stepParams, context);
    }

    const result = await runSingleSkill(skill, stepParams, ctx);
    if (!result.ok) {
      return {
        ok: false,
        error: `Workflow gagal di step '${step.skillSlug}': ${result.error}`,
        data: { stepResults },
        executionTimeMs: Date.now() - started,
      };
    }
    stepResults.push({ skill: step.skillSlug, output: result.data });
    context = { ...context, [`${step.skillSlug}_result`]: result.data };
  }

  return {
    ok: true,
    data: { steps: stepResults },
    executionTimeMs: Date.now() - started,
  };
}

export async function executeAgentSkill(
  skill: AgentSkillRecord,
  params: Record<string, unknown>,
  ctx: SkillExecutionContext
): Promise<SkillExecutionResult> {
  if (skill.skillType === "workflow") {
    return executeWorkflowSkill(
      skill.config as WorkflowSkillConfig,
      params,
      ctx
    );
  }
  return runSingleSkill(skill, params, ctx);
}
