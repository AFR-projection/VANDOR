import { dispatchFromChat } from "@/lib/autonomous/chat-dispatch";
import { autonomousConfig } from "@/lib/autonomous/config";
import {
  buildDeployApprovalSummary,
  buildDeployCommands,
} from "@/lib/autonomous/deploy";
import { collectServiceHealth } from "@/lib/autonomous/services";
import type {
  AgentExecutionContext,
  AgentExecutionResult,
} from "../core/types";
import { runAgentTool } from "../tools/run-agent-tool";

function userText(ctx: AgentExecutionContext): string {
  return String(
    ctx.input.userRequest ?? ctx.input.message ?? ctx.input.query ?? ""
  ).trim();
}

export async function runDeployPreflight(): Promise<{
  path: string;
  branch: string;
  commandCount: number;
  summary: string;
  services: Awaited<ReturnType<typeof collectServiceHealth>>;
  allServicesHealthy: boolean;
}> {
  const services = await collectServiceHealth();
  const unhealthy = services.filter((s) => !s.healthy);
  return {
    path: autonomousConfig.deployPath,
    branch: autonomousConfig.deployBranch,
    commandCount: buildDeployCommands().length,
    summary: buildDeployApprovalSummary(),
    services,
    allServicesHealthy: unhealthy.length === 0,
  };
}

export async function deployAgentExecute(
  ctx: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const action = String(ctx.input.action ?? "dispatch");
  const text = userText(ctx);

  if (action === "preflight" || action === "preview") {
    const preflight = await runDeployPreflight();
    return {
      ok: true,
      output: {
        preflight,
        commands: buildDeployCommands(),
        previewOnly: true,
      },
      summary: `Preflight deploy: ${preflight.path} (${preflight.branch}) — ${preflight.commandCount} langkah`,
    };
  }

  const preflight = await runDeployPreflight();
  const servicesProbe = await runAgentTool(ctx, "monitor.services", {});

  if (!ctx.chatId) {
    return {
      ok: false,
      error: "Deploy agent membutuhkan chatId untuk approval owner.",
      output: { preflight },
      summary: "Deploy: chatId tidak tersedia",
    };
  }

  const dispatched = await dispatchFromChat({
    jobType: "deploy",
    chatId: ctx.chatId,
    userId: ctx.userId,
    notifyOnComplete: true,
  });

  if (!dispatched.ok) {
    return {
      ok: false,
      output: { preflight, dispatch: dispatched },
      summary: "Deploy: gagal antre ke worker",
      error: dispatched.error,
    };
  }

  const healthNote = preflight.allServicesHealthy
    ? "Semua service terpantau online."
    : `${preflight.services.filter((s) => !s.healthy).length} service perlu perhatian sebelum deploy.`;

  return {
    ok: true,
    output: {
      dispatch: dispatched,
      preflight,
      servicesProbe: servicesProbe.data,
      approvalRequired: true,
      deploySummary: buildDeployApprovalSummary(),
      userRequest: text.slice(0, 200),
    },
    summary: `${dispatched.message} ${healthNote} Setujui di Operator atau balas SETUJU di WhatsApp.`,
  };
}
