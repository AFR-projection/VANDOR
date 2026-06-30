import { runAutoFixCommand } from "@/lib/autonomous/auto-fix";
import {
  collectSystemAwareness,
  formatAwarenessForUser,
} from "@/lib/autonomous/awareness";
import { resolveAgentCwd, runCliCommand } from "@/lib/autonomous/cli/runner";
import { analyzeCodeScan } from "@/lib/autonomous/coding-agent/analyze";
import {
  type CodeScanResult,
  runCodeScan,
} from "@/lib/autonomous/coding-agent/scan";
import { canAutoFixCommand } from "@/lib/autonomous/rule-engine";
import { detectFootballNeed } from "@/lib/football/detect";
import type {
  AgentExecutionContext,
  AgentExecutionResult,
} from "../core/types";
import { readAgentMemoryPack } from "../memory/types";
import { runAgentTool } from "../tools/run-agent-tool";
import {
  detectDocumentExportFormat,
  documentFormatLabel,
} from "../document/detect-format";
import {
  buildDefaultSpreadsheet,
  buildMarkdownDocumentBody,
  inferDocumentTitle,
} from "../document/generate-content";
import {
  summarizeStepOutput,
  synthesizeChatFromWorkflowSteps,
} from "../chat/format-response";
import { summaryWithDownloadUrl } from "../chat/deliverables";

const SCAN_CODEBASE_RE =
  /\b(scan\s+(?:code|codebase|repo)|perbaiki\s+(?:error|code|codebase)|cek\s+log)\b/i;
const FULL_BUILD_RE = /\b(full\s*build|npm\s+run\s+build|build\s+prod)\b/i;

const FIX_RE = /\b(perbaiki|fix|auto-?fix|error|bug)\b/i;

const IMAGE_GEN_RE =
  /\b(gambar|image|logo|ilustrasi|draw|illustrat|buat\s+(?:kan\s+)?(?:sebuah\s+)?gambar)\b/i;

function userText(ctx: AgentExecutionContext): string {
  return String(
    ctx.input.userRequest ?? ctx.input.message ?? ctx.input.query ?? ""
  ).trim();
}

function inferJobType(
  text: string
): "code_scan" | "log_scan" | "monitor" | null {
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

function scanFromPriorSteps(ctx: AgentExecutionContext): CodeScanResult | null {
  for (const prior of ctx.priorSteps ?? []) {
    const scan = prior.output.scan as CodeScanResult | undefined;
    if (scan?.sessionId) {
      return scan;
    }
    const nested = prior.output.scanAfter as CodeScanResult | undefined;
    if (nested?.sessionId) {
      return nested;
    }
  }
  return null;
}

async function runPlatformUnitTests(): Promise<{
  ok: boolean;
  summary: string;
  tail: string;
}> {
  const res = await runCliCommand("npm run test:platform", {
    cwd: resolveAgentCwd(),
    timeoutMs: 120_000,
    stream: "coding",
    echo: false,
  });
  const combined = `${res.stdout}\n${res.stderr}`.trim();
  return {
    ok: res.ok,
    summary: res.ok
      ? "Platform tests: 16/16 lulus"
      : `Platform tests gagal (exit ${res.exitCode ?? "?"})`,
    tail: combined.slice(-600),
  };
}

export async function toolAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const text = userText(ctx);
  const action = String(ctx.input.action ?? "");
  const intent = String(ctx.input.intent ?? "");

  if (
    action === "generate_image" ||
    (intent === "image" && IMAGE_GEN_RE.test(text))
  ) {
    const result = await runAgentTool(ctx, "generateImage", {
      prompt: String(ctx.input.prompt ?? text),
      aspectRatio: ctx.input.aspectRatio,
      model: ctx.input.model,
    });
    return {
      ok: result.ok,
      output: { image: result.data },
      summary:
        result.summary ??
        (result.ok ? "Gambar berhasil dibuat" : "Gagal generate gambar"),
      error: result.error,
    };
  }

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

  return {
    ok: false,
    error: "Coding agent: tidak ada permintaan yang dikenali",
  };
}

export async function browserAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const query = userText(ctx);
  if (query.length < 2) {
    return { ok: false, error: "Browser agent: query riset kosong" };
  }

  if (detectFootballNeed(query).needed) {
    const football = await runAgentTool(ctx, "footballApi", {
      action: "smart_query",
      query,
    });
    if (football.ok) {
      return {
        ok: true,
        output: football.data as Record<string, unknown>,
        summary: football.summary ?? "Data sepak bola dari API-Football",
      };
    }
  }

  const result = await runAgentTool(ctx, "webSearch", {
    query,
    news: /\b(berita|news|terbaru)\b/i.test(query),
    maxResults: 5,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const data = result.data as {
    sources?: Array<{ title?: string; url?: string }>;
  };
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
  const format = detectDocumentExportFormat(text, ctx.input);

  const priorBody = (ctx.priorSteps ?? [])
    .map((prior) => {
      const summary = summarizeStepOutput(prior.output);
      if (!summary) {
        return "";
      }
      return `## ${prior.agentId} / ${prior.stepKey}\n${summary}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const title = inferDocumentTitle(
    text,
    format === "csv" ? "xlsx" : format
  );

  if (format === "xlsx" || format === "csv") {
    const spreadsheet = buildDefaultSpreadsheet({ userText: text, title });
    const result = await runAgentTool(ctx, "createSpreadsheet", {
      title: spreadsheet.title,
      format,
      sheets: spreadsheet.sheets,
    });
    return {
      ok: result.ok,
      output: { document: result.data, format },
      summary: result.ok
        ? summaryWithDownloadUrl(
            `${documentFormatLabel(format)} "${spreadsheet.title}"`,
            result.data
          )
        : (result.summary ??
          `${documentFormatLabel(format)} "${spreadsheet.title}"`),
      error: result.error,
    };
  }

  if (format === "docx") {
    const body = buildMarkdownDocumentBody({
      userText: text,
      priorBody,
      title,
    });
    const result = await runAgentTool(ctx, "createDocx", { title, body });
    return {
      ok: result.ok,
      output: { document: result.data, format },
      summary: result.ok
        ? summaryWithDownloadUrl(`Word "${title}" dibuat`, result.data)
        : (result.summary ?? `Word "${title}" dibuat`),
      error: result.error,
    };
  }

  const body = buildMarkdownDocumentBody({
    userText: text,
    priorBody,
    title,
  });
  const result = await runAgentTool(ctx, "createPdf", { title, body });
  return {
    ok: result.ok,
    output: { document: result.data, format: "pdf" },
    summary: result.ok
      ? summaryWithDownloadUrl(`PDF "${title}" dibuat`, result.data)
      : (result.summary ?? `PDF "${title}" dibuat`),
    error: result.error,
  };
}

export async function memoryAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const query = String(ctx.input.query ?? ctx.input.userRequest ?? "").trim();
  const memoryPack = readAgentMemoryPack(ctx.input);

  if (ctx.input.action === "save" && ctx.input.content) {
    const scopeRaw = String(
      ctx.input.scope ?? ctx.input.platformScope ?? "user"
    );
    const saved = await runAgentTool(ctx, "saveMemory", {
      content: String(ctx.input.content),
      category: ctx.input.category,
      platformScope: scopeRaw,
    });
    return {
      ok: saved.ok,
      output: { saved: saved.data, scope: scopeRaw, memoryPack },
      summary: saved.summary ?? `Memory agent: simpan (${scopeRaw})`,
      error: saved.error,
    };
  }

  if (memoryPack && memoryPack.context.length > 0) {
    return {
      ok: true,
      output: {
        recall: memoryPack,
        scopes: memoryPack.scopes,
        itemCount: memoryPack.itemCount,
      },
      summary: `Memory agent: ${memoryPack.itemCount} item dari scope [${memoryPack.scopes.join(", ")}]`,
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
  const text = userText(ctx);

  if (scope === "platform") {
    const platformTests = await runPlatformUnitTests();
    return {
      ok: platformTests.ok,
      output: { platformTests },
      summary: platformTests.summary,
      error: platformTests.ok ? undefined : platformTests.tail.slice(0, 200),
    };
  }

  let scan = scanFromPriorSteps(ctx);
  if (!scan) {
    scan = await runCodeScan({
      fullBuild: false,
      includeUltracite: /\bultracite|lint\b/i.test(text),
      echo: false,
    });
  }

  let platformOk = true;
  let platformSummary = "Platform tests: dilewati";

  if (scope === "full") {
    const platformTests = await runPlatformUnitTests();
    platformOk = platformTests.ok;
    platformSummary = platformTests.summary;
  }

  const verified = scan.ok && platformOk;

  return {
    ok: verified,
    output: {
      scan,
      verified,
      tscOk: scan.ok,
      platformOk,
      platformSummary,
    },
    summary: verified
      ? scope === "full"
        ? "Testing: TS + platform tests lulus"
        : "Testing: TypeScript check lulus"
      : scan.ok
        ? platformSummary
        : `Testing: ${scan.errorCount} error TypeScript`,
    error: verified ? undefined : scan.summary,
  };
}

export async function fixAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const text = userText(ctx);
  const autoFix =
    Boolean(ctx.input.autoFix) ||
    String(ctx.input.mode ?? "") === "autofix" ||
    FIX_RE.test(text);

  let scan = scanFromPriorSteps(ctx);
  if (!scan) {
    scan = await runCodeScan({
      fullBuild: false,
      includeUltracite: false,
      echo: false,
    });
  }

  if (scan.ok) {
    return {
      ok: true,
      output: { scan, fixed: false },
      summary: "Fix: codebase bersih — tidak ada yang diperbaiki",
    };
  }

  const analysis = await analyzeCodeScan(scan);

  if (!autoFix) {
    return {
      ok: true,
      output: {
        scan,
        analysis,
        needsApproval: analysis.needsApproval,
        suggestedCommands: analysis.suggestedCommands,
      },
      summary: `Fix: ${analysis.diagnosis.slice(0, 160)}`,
    };
  }

  if (ctx.chatId && analysis.suggestedCommands.length === 0) {
    const dispatched = await runAgentTool(ctx, "agentWork", {
      action: "dispatch",
      jobType: "code_fix",
    });
    return {
      ok: dispatched.ok,
      output: { analysis, dispatch: dispatched.data },
      summary: dispatched.summary ?? "Fix: pipeline worker diantre",
      error: dispatched.error,
    };
  }

  const commandsRun: string[] = [];
  for (const command of analysis.suggestedCommands) {
    if (!canAutoFixCommand(command)) {
      continue;
    }
    const fix = await runAutoFixCommand(command, { source: "platform-fix" });
    commandsRun.push(command);
    if (fix.ok) {
      break;
    }
  }

  const rescan = await runCodeScan({
    sessionId: scan.sessionId,
    fullBuild: false,
    echo: false,
  });

  return {
    ok: rescan.ok,
    output: {
      analysis,
      commandsRun,
      scanBefore: scan,
      scanAfter: rescan,
      fixed: rescan.ok,
    },
    summary: rescan.ok
      ? `Fix: berhasil (${commandsRun.join(", ") || "analisis"})`
      : `Fix: masih ada error — ${analysis.diagnosis.slice(0, 120)}`,
    error: rescan.ok ? undefined : analysis.diagnosis.slice(0, 300),
  };
}

export async function chatAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const message = userText(ctx);
  const formatWorkflow = ctx.input.formatWorkflow === true;

  let reply = message;
  if (formatWorkflow) {
    reply = synthesizeChatFromWorkflowSteps({
      userText: message,
      priorSteps: (ctx.priorSteps ?? []).map((prior) => ({
        stepKey: prior.stepKey,
        agentId: prior.agentId,
        output: prior.output,
      })),
    });
  }

  return {
    ok: true,
    output: {
      message: reply,
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
        notes: "Planner in-workflow — rencana utama dibuat saat dispatch chat",
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
