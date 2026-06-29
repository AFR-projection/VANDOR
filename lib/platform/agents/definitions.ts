import type { AgentDefinition } from "../core/agent-definition";
import { defineAgent } from "../core/agent-definition";
import { AGENT_TOOL_MAP } from "../core/tool-catalog";
import type {
  AgentExecutionContext,
  AgentExecutionResult,
  PlatformAgentId,
} from "../core/types";
import { executePlatformTool } from "../core/tool-registry";

function stubExecute(agentId: PlatformAgentId) {
  return async (ctx: AgentExecutionContext): Promise<AgentExecutionResult> => {
    return {
      ok: true,
      output: {
        agentId,
        phase: 0,
        stub: true,
        received: ctx.input,
      },
      summary: `${agentId} acknowledged (fase 0 stub)`,
    };
  };
}

async function orchestratorExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const action = String(ctx.input.action ?? "ping");

  if (action === "ping") {
    const tool = await executePlatformTool(
      "platform.workflow.ping",
      {},
      {
        runId: ctx.runId,
        stepId: ctx.stepId,
        userId: ctx.userId,
        agentId: "orchestrator",
        autonomous: true,
      }
    );
    if (!tool.ok) {
      return { ok: false, error: tool.error };
    }
    return {
      ok: true,
      output: { pong: tool.data, action },
      summary: "Orchestrator ping OK",
    };
  }

  return {
    ok: true,
    output: { action, routed: true },
    summary: `Orchestrator handled action: ${action}`,
  };
}

async function monitoringExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const action = String(ctx.input.action ?? "check_system");

  if (action === "check_system") {
    const tool = await executePlatformTool(
      "checkSystem",
      {},
      {
        runId: ctx.runId,
        stepId: ctx.stepId,
        userId: ctx.userId,
        agentId: "monitoring",
        autonomous: false,
      }
    );
    if (!tool.ok) {
      return { ok: false, error: tool.error };
    }
    return {
      ok: true,
      output: { system: tool.data, summary: tool.summary ?? "System check OK" },
      summary: tool.summary ?? "Monitoring: system check selesai",
    };
  }

  return stubExecute("monitoring")(ctx);
}

async function plannerExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const userRequest = String(ctx.input.userRequest ?? ctx.input.summary ?? "");
  return {
    ok: true,
    output: {
      plan: {
        summary: `Analisis: ${userRequest.slice(0, 200)}`,
        notes: "Planner step dalam workflow — rencana utama sudah dibuat di chat dispatch",
      },
    },
    summary: "Planner menganalisis permintaan",
  };
}

async function chatExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  return {
    ok: true,
    output: {
      message: String(ctx.input.message ?? ctx.input.summary ?? ""),
      deliverToUser: true,
    },
    summary: "Chat agent formatted response",
  };
}

/** Definisi 12 agent V2 — fase 0 dengan stub executor (kecuali orchestrator ping). */
export const PLATFORM_AGENT_DEFINITIONS: AgentDefinition[] = [
  defineAgent({
    id: "chat",
    name: "Chat Agent",
    description:
      "Interaksi user, intent, penjelasan hasil — tidak mengerjakan task teknis.",
    capabilities: ["conversation", "intent", "summarize", "deliver"],
    tools: AGENT_TOOL_MAP.chat,
    memoryScopes: ["conversation", "user", "short_term"],
    execute: chatExecute,
  }),
  defineAgent({
    id: "planner",
    name: "Planner Agent",
    description: "Analisa permintaan, buat execution plan, tentukan agent.",
    capabilities: ["analyze", "decompose", "schedule"],
    tools: AGENT_TOOL_MAP.planner,
    memoryScopes: ["conversation", "project", "user"],
    execute: plannerExecute,
  }),
  defineAgent({
    id: "orchestrator",
    name: "Orchestrator",
    description:
      "Otak workflow — routing, retry, queue, agregasi hasil. Bukan LLM.",
    capabilities: [
      "workflow",
      "retry",
      "timeout",
      "queue",
      "aggregate",
      "monitor",
    ],
    tools: AGENT_TOOL_MAP.orchestrator,
    memoryScopes: ["short_term"],
    execute: orchestratorExecute,
  }),
  defineAgent({
    id: "coding",
    name: "Coding Agent",
    description: "Backend, frontend, API, refactor, bug fix, tools & skills.",
    capabilities: ["code", "refactor", "debug", "api", "database"],
    tools: AGENT_TOOL_MAP.coding,
    memoryScopes: ["project", "knowledge", "short_term"],
    execute: stubExecute("coding"),
  }),
  defineAgent({
    id: "browser",
    name: "Browser Agent",
    description: "Web search, research, crawl, dokumentasi, validasi info.",
    capabilities: ["search", "research", "crawl", "validate"],
    tools: AGENT_TOOL_MAP.browser,
    memoryScopes: ["knowledge", "short_term"],
    execute: stubExecute("browser"),
  }),
  defineAgent({
    id: "document",
    name: "Document Agent",
    description: "PDF, DOCX, XLSX, CSV, OCR, ringkasan & analisa dokumen.",
    capabilities: ["pdf", "docx", "xlsx", "ocr", "summarize"],
    tools: AGENT_TOOL_MAP.document,
    memoryScopes: ["project", "knowledge"],
    execute: stubExecute("document"),
  }),
  defineAgent({
    id: "memory",
    name: "Memory Agent",
    description: "Gateway memori — short/long/conversation/project/user/knowledge.",
    capabilities: ["store", "retrieve", "merge", "scope"],
    tools: AGENT_TOOL_MAP.memory,
    memoryScopes: [
      "short_term",
      "long_term",
      "conversation",
      "project",
      "user",
      "knowledge",
    ],
    execute: stubExecute("memory"),
  }),
  defineAgent({
    id: "tool",
    name: "Tool Agent",
    description: "Eksekutor integrasi: DB, API, WA, VPS, Docker, custom tools.",
    capabilities: ["integrate", "execute", "plugin"],
    tools: AGENT_TOOL_MAP.tool,
    memoryScopes: ["short_term", "user"],
    execute: stubExecute("tool"),
  }),
  defineAgent({
    id: "testing",
    name: "Testing Agent",
    description: "Unit, integration, e2e, security, stress, performance tests.",
    capabilities: ["unit", "integration", "e2e", "security", "performance"],
    tools: AGENT_TOOL_MAP.testing,
    memoryScopes: ["project", "short_term"],
    execute: stubExecute("testing"),
  }),
  defineAgent({
    id: "fix",
    name: "Fix Agent",
    description: "Analisa error, perbaiki, koordinasi re-test via orchestrator.",
    capabilities: ["diagnose", "patch", "verify"],
    tools: AGENT_TOOL_MAP.fix,
    memoryScopes: ["project", "knowledge"],
    execute: stubExecute("fix"),
  }),
  defineAgent({
    id: "deploy",
    name: "Deployment Agent",
    description: "Docker, VPS, PM2, CI/CD, rollback, backup, health check.",
    capabilities: ["deploy", "rollback", "backup", "health"],
    tools: AGENT_TOOL_MAP.deploy,
    memoryScopes: ["project", "short_term"],
    execute: stubExecute("deploy"),
  }),
  defineAgent({
    id: "monitoring",
    name: "Monitoring Agent",
    description: "CPU, RAM, token, API, error, log, workflow, queue, health.",
    capabilities: ["metrics", "logs", "alerts", "cost"],
    tools: AGENT_TOOL_MAP.monitoring,
    memoryScopes: ["short_term", "knowledge"],
    execute: monitoringExecute,
  }),
];
