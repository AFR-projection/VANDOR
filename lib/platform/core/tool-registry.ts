import { createLogger } from "@/lib/autonomous/logger";
import { runTool as runWorkerTool } from "@/lib/autonomous/tools/index";
import type { ToolContext } from "@/lib/autonomous/types";
import type { AgentRiskLevel } from "@/lib/db/schema";
import { buildStaticToolCatalog } from "./tool-catalog";
import type {
  PlatformAgentId,
  PlatformToolContext,
  PlatformToolExecuteResult,
  PlatformToolMeta,
  ToolSource,
} from "./types";

type PlatformNativeTool = {
  name: string;
  description: string;
  risk: AgentRiskLevel;
  agents: PlatformAgentId[];
  execute: (
    input: Record<string, unknown>,
    ctx: PlatformToolContext
  ) => Promise<PlatformToolExecuteResult>;
};

const catalog = new Map<string, PlatformToolMeta>();
const nativeExecutors = new Map<string, PlatformNativeTool>();

let catalogBootstrapped = false;

function ensureCatalog(): void {
  if (catalogBootstrapped) {
    return;
  }
  for (const meta of buildStaticToolCatalog()) {
    catalog.set(meta.name, meta);
  }
  catalogBootstrapped = true;
}

export function registerPlatformTool(def: PlatformNativeTool): void {
  ensureCatalog();
  if (catalog.has(def.name)) {
    throw new Error(`Tool '${def.name}' sudah ada di katalog.`);
  }
  catalog.set(def.name, {
    name: def.name,
    description: def.description,
    source: "platform",
    risk: def.risk,
    agents: def.agents,
  });
  nativeExecutors.set(def.name, def);
}

export function getToolMeta(name: string): PlatformToolMeta | undefined {
  ensureCatalog();
  return catalog.get(name);
}

export function listTools(filter?: {
  source?: ToolSource;
  agentId?: PlatformAgentId;
}): PlatformToolMeta[] {
  ensureCatalog();
  let items = Array.from(catalog.values());
  if (filter?.source) {
    items = items.filter((t) => t.source === filter.source);
  }
  if (filter?.agentId) {
    items = items.filter(
      (t) =>
        t.agents.length === 0 ||
        t.agents.includes(filter.agentId as PlatformAgentId)
    );
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function listToolsForAgent(
  agentId: PlatformAgentId
): PlatformToolMeta[] {
  return listTools({ agentId });
}

function agentMayUseTool(agentId: PlatformAgentId, toolName: string): boolean {
  const meta = getToolMeta(toolName);
  if (!meta) {
    return false;
  }
  if (meta.agents.length === 0) {
    return true;
  }
  return meta.agents.includes(agentId);
}

/**
 * Unified execution — route ke worker / platform native.
 * Chat & skill tools dieksekusi via chat route (fase 2+); fase 0 = metadata + worker only.
 */
export async function executePlatformTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: PlatformToolContext
): Promise<PlatformToolExecuteResult> {
  ensureCatalog();

  if (!agentMayUseTool(ctx.agentId, toolName)) {
    return {
      ok: false,
      error: `Agent '${ctx.agentId}' tidak punya akses ke tool '${toolName}'`,
    };
  }

  const meta = getToolMeta(toolName);
  if (!meta) {
    return { ok: false, error: `Tool '${toolName}' tidak ditemukan` };
  }

  const native = nativeExecutors.get(toolName);
  if (native) {
    return native.execute(input, ctx);
  }

  if (meta.source === "worker") {
    const workerCtx: ToolContext = {
      logger: createLogger(`platform:${ctx.agentId}`),
      ownerUserId: ctx.userId,
      autonomous: ctx.autonomous,
      task: null,
    };
    const result = await runWorkerTool(toolName, input, workerCtx);
    return {
      ok: result.ok,
      data: result.data,
      error: result.error,
      summary: result.summary,
    };
  }

  if (meta.source === "chat" || meta.source === "skill") {
    const { executeChatToolForPlatform } = await import("../tools/chat-bridge");
    return executeChatToolForPlatform(toolName, input, ctx);
  }

  return { ok: false, error: `Tool '${toolName}' tidak dapat dieksekusi` };
}

export function isToolCatalogBootstrapped(): boolean {
  return catalogBootstrapped;
}

export function resetToolCatalogForTests(): void {
  catalog.clear();
  nativeExecutors.clear();
  catalogBootstrapped = false;
}

/** Daftarkan tool platform bawaan. */
export function registerBuiltinPlatformTools(): void {
  registerPlatformTool({
    name: "platform.workflow.ping",
    description: "Smoke test workflow internal platform V2",
    risk: "safe",
    agents: ["orchestrator"],
    execute: (_input, ctx) =>
      Promise.resolve({
        ok: true,
        data: {
          pong: true,
          at: new Date().toISOString(),
          runId: ctx.runId,
        },
        summary: "platform pong",
      }),
  });
}
