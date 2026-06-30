import {
  collectSystemAwareness,
  formatAwarenessForUser,
} from "@/lib/autonomous/awareness";
import { runCodeScan } from "@/lib/autonomous/coding-agent/scan";
import type {
  AgentExecutionContext,
  AgentExecutionResult,
  PlatformAgentId,
} from "../core/types";
import { runAgentTool } from "../tools/run-agent-tool";

const SCAN_CODEBASE_RE =
  /\b(scan\s+(?:code|codebase|repo)|perbaiki\s+(?:error|code|codebase)|cek\s+log)\b/i;
const FULL_BUILD_RE = /\b(full\s*build|npm\s+run\s+build|build\s+prod)\b/i;

function userText(ctx: AgentExecutionContext): string {
  return String(
    ctx.input.userRequest ?? ctx.input.message ?? ctx.input.query ?? ""
  ).trim();
}

function inferJobType(text: string): "code_scan" | "log_scan" | "monitor" | null {
  if (SCAN_CODEBASE_RE.test(text)) {
    return "code_scan";
  }
  if (/\b(log|error\s+log)\b/i.test(text)) {
    return "log_scan";
  }
  if (/\b(monitor|metrik|cpu|ram|disk)\b/i.test(text)) {
    return "monitor";
  }
  return null;
}

export async function toolAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const text = userText(ctx);
  const jobType =
    (ctx.input.jobType as string | undefined) ?? inferJobType(text);

  if (jobType === "code_scan" && ctx.chatId) {
    const heavy = Boolean(ctx.input.fullBuild) || FULL_BUILD_RE.test(text);
    if (heavy) {
      const dispatched = await runAgentTool(ctx, "agentWork", {
        action: "dispatch",
        jobType: "code_scan",
        fullBuild: true,
        includeUltracite: Boolean(ctx.input.includeUltracite),
      });
      if (!dispatched.ok) {
        return { ok: false, error: dispatched.error };
      }
      return {
        ok: true,
        output: { dispatch: dispatched.data },
        summary: dispatched.summary ?? "Scan codebase diantre ke worker",
      };
    }
  }

  if (jobType === "log_scan" && ctx.chatId) {
    const dispatched = await runAgentTool(ctx, "agentWork", {
      action: "dispatch",
      jobType: "log_scan",
    });
    return {
      ok: dispatched.ok,
      output: { dispatch: dispatched.data },
      summary: dispatched.summary ?? "Log scan diantre",
      error: dispatched.error,
    };
  }

  const metrics = await runAgentTool(ctx, "monitor.metrics", {});
  return {
    ok: metrics.ok,
    output: { metrics: metrics.data },
    summary: metrics.summary ?? "Tool agent: snapshot metrik",
    error: metrics.error,
  };
}

export async function monitoringAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const action = String(ctx.input.action ?? "check_system");

  if (action === "check_system") {
    const snapshot = await collectSystemAwareness({ live: true });
    const summary = formatAwarenessForUser(snapshot);
    return {
      ok: true,
      output: {
        system: snapshot,
        summary,
        healthScore: snapshot.healthScore,
        grade: snapshot.grade,
      },
      summary: `Monitoring: skor ${snapshot.healthScore}/100 (${snapshot.grade})`,
    };
  }

  const toolMap: Record<string, string> = {
    metrics: "monitor.metrics",
    services: "monitor.services",
    uptime: "monitor.uptime",
    logs: "monitor.logs",
    ping: "system.ping",
  };

  const toolName = toolMap[action];
  if (toolName) {
    const result = await runAgentTool(ctx, toolName, ctx.input);
    return {
      ok: result.ok,
      output: { [action]: result.data },
      summary: result.summary ?? `Monitoring ${action} selesai`,
      error: result.error,
    };
  }

  return {
    ok: false,
    error: `Aksi monitoring tidak dikenal: ${action}`,
  };
}

export async function codingAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const text = userText(ctx);
  const action = String(ctx.input.action ?? "");
  const wantsScan =
    action === "scan_codebase" ||
    SCAN_CODEBASE_RE.test(text) ||
    action === "implement" ||
    action === "verify";

  const heavy = Boolean(ctx.input.fullBuild) || FULL_BUILD_RE.test(text);

  if (heavy && ctx.chatId) {
    const dispatched = await runAgentTool(ctx, "agentWork", {
      action: "dispatch",
      jobType: "code_scan",
      fullBuild: true,
      includeUltracite: Boolean(ctx.input.includeUltracite),
    });
    if (!dispatched.ok) {
      return { ok: false, error: dispatched.error };
    }
    return {
      ok: true,
      output: { mode: "async", dispatch: dispatched.data },
      summary: dispatched.summary ?? "Full scan di worker (async)",
    };
  }

  if (wantsScan || text.length > 0) {
    const scan = await runCodeScan({
      fullBuild: false,
      includeUltracite: Boolean(ctx.input.includeUltracite),
      echo: false,
    });
    return {
      ok: scan.ok,
      output: { scan, sessionId: scan.sessionId },
      summary: scan.summary,
      error: scan.ok ? undefined : `Scan: ${scan.errorCount} error ditemukan`,
    };
  }

  return { ok: false, error: "Coding agent: tidak ada permintaan yang dikenali" };
}

export async function browserAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const query = userText(ctx);
  if (query.length < 2) {
    return { ok: false, error: "Browser agent: query riset kosong" };
  }

  const result = await runAgentTool(ctx, "webSearch", {
    query,
    news: /\b(berita|news|terbaru)\b/i.test(query),
    maxResults: 5,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data as { sources?: Array<{ title?: string; url?: string }> };
  const top = data.sources?.slice(0, 3).map((s) => s.title ?? s.url) ?? [];

  return {
    ok: true,
    output: { search: result.data, topSources: top },
    summary: result.summary ?? `Riset web: ${top.length} sumber utama`,
  };
}

export async function documentAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const text = userText(ctx);
  const intent = String(ctx.input.intent ?? "");

  if (/\bpdf\b/i.test(text) || intent === "pdf") {
    const result = await runAgentTool(ctx, "createPdf", {
      title: String(ctx.input.title ?? "Ringkasan VANDOR").slice(0, 160),
      body: String(ctx.input.body ?? text).slice(0, 40_000),
    });
    return {
      ok: result.ok,
      output: { document: result.data },
      summary: result.summary ?? "Document agent: PDF",
      error: result.error,
    };
  }

  return {
    ok: true,
    output: {
      note: "Dokumen non-PDF — gunakan chat dengan lampiran atau minta PDF eksplisit",
      userRequest: text.slice(0, 500),
    },
    summary: "Document agent: analisis permintaan dokumen (PDF via createPdf)",
  };
}

export async function memoryAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const query = String(ctx.input.query ?? ctx.input.userRequest ?? "").trim();

  if (ctx.input.action === "save" && ctx.input.content) {
    const saved = await runAgentTool(ctx, "saveMemory", {
      content: String(ctx.input.content),
      category: ctx.input.category,
    });
    return {
      ok: saved.ok,
      output: { saved: saved.data },
      summary: saved.summary ?? "Memory agent: simpan",
      error: saved.error,
    };
  }

  if (query.length < 2) {
    const recent = await runAgentTool(ctx, "getMemory", { limit: 5 });
    return {
      ok: recent.ok,
      output: { memories: recent.data },
      summary: recent.summary ?? "Memory agent: memori terbaru",
      error: recent.error,
    };
  }

  const found = await runAgentTool(ctx, "searchDb", { query, limit: 8 });
  return {
    ok: found.ok,
    output: { recall: found.data },
    summary: found.summary ?? `Memory agent: recall "${query.slice(0, 40)}"`,
    error: found.error,
  };
}

export async function testingAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const scope = String(ctx.input.scope ?? "code");
  if (scope !== "code") {
    return {
      ok: true,
      output: { scope, verified: true, note: "Smoke verify (fase 4: test runner penuh)" },
      summary: `Testing: verifikasi ${scope} (placeholder)`,
    };
  }

  const scan = await runCodeScan({
    fullBuild: false,
    includeUltracite: false,
    echo: false,
  });

  return {
    ok: scan.ok,
    output: { scan, verified: scan.ok },
    summary: scan.ok
      ? "Testing: TypeScript check lulus"
      : `Testing: ${scan.errorCount} error TypeScript`,
    error: scan.ok ? undefined : scan.summary,
  };
}

export async function chatAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const message = userText(ctx);
  const formatWorkflow = ctx.input.formatWorkflow === true;

  return {
    ok: true,
    output: {
      message: formatWorkflow
        ? `Permintaan diproses oleh multi-agent workflow. Detail ada di ringkasan langkah di atas.${message ? `\n\n_Permintaan:_ ${message.slice(0, 300)}` : ""}`
        : message,
      deliverToUser: true,
      formatWorkflow,
    },
    summary: "Chat agent: respons ke user",
  };
}

export async function plannerAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const userRequest = userText(ctx);
  return {
    ok: true,
    output: {
      plan: {
        summary: `Analisis: ${userRequest.slice(0, 200)}`,
        notes:
          "Planner in-workflow — rencana utama dibuat saat dispatch chat",
      },
    },
    summary: "Planner menganalisis permintaan",
  };
}

export async function orchestratorAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const action = String(ctx.input.action ?? "ping");

  if (action === "ping") {
    const tool = await runAgentTool(ctx, "platform.workflow.ping", {});
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

export function stubAgentExecute(agentId: PlatformAgentId) {
  return async (ctx: AgentExecutionContext): Promise<AgentExecutionResult> => ({
    ok: true,
    output: {
      agentId,
      phase: 3,
      deferred: true,
      received: ctx.input,
    },
    summary: `${agentId} — fase 4/5 (belum diimplementasi)`,
  });
}
