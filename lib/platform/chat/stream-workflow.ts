import "server-only";

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import {
  agentDone,
  agentEvent,
  agentProgress,
  agentStatus,
  agentStepComplete,
  agentStepStart,
} from "@/lib/agent-activity/emit";
import { applyChatTitle } from "@/lib/chat/title";
import { saveMessages } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { platformAgentLabel, platformStepLabel } from "./agent-labels";
import type { PlatformChatDispatchInput } from "./dispatch";
import { formatPlatformWorkflowReply } from "./format-response";
import { bootstrapPlatformV2 } from "../init";
import { processWorkflowRunToCompletion } from "../orchestrator/engine";
import type { WorkflowProgressEvent } from "../orchestrator/progress";
import { generateExecutionPlan } from "../planner/generate-plan";
import { normalizeExecutionPlan } from "../planner/normalize-plan";
import { getWorkflowRunById, listStepsForRun } from "../queue/queries";
import { createWorkflowRun } from "../queue/workflow-run";
import {
  isPlatformChatWorkflowEnabled,
  shouldRouteToPlatformWorkflow,
} from "./routing";

function emitProgress(
  dataStream: Parameters<
    Parameters<typeof createUIMessageStream>[0]["execute"]
  >[0]["writer"],
  totalSteps: number,
  completedCount: { value: number },
  event: WorkflowProgressEvent
): void {
  switch (event.type) {
    case "step-start":
      agentStepStart(
        dataStream,
        event.stepKey,
        platformStepLabel(event.agentId, event.stepKey)
      );
      if (event.attempt > 1) {
        agentEvent(
          dataStream,
          `Retry ${event.agentId} (attempt ${event.attempt})`,
          "warn"
        );
      }
      agentStatus(
        dataStream,
        `${platformAgentLabel(event.agentId)} sedang bekerja…`
      );
      break;
    case "step-complete":
      agentStepComplete(dataStream, event.stepKey);
      completedCount.value += 1;
      agentProgress(
        dataStream,
        Math.min(
          92,
          Math.round((completedCount.value / Math.max(totalSteps, 1)) * 88) + 8
        )
      );
      if (event.summary?.trim()) {
        agentEvent(dataStream, event.summary.trim(), "success");
      }
      break;
    case "step-failed":
      agentEvent(
        dataStream,
        `${platformAgentLabel(event.agentId)} gagal: ${event.error.slice(0, 120)}`,
        "warn"
      );
      if (event.willRetry) {
        agentEvent(dataStream, "Menunggu retry otomatis…", "info");
      }
      break;
    case "waiting-retry":
      agentStatus(dataStream, "Menunggu retry agent…");
      agentEvent(
        dataStream,
        `Backoff ~${Math.ceil(event.retryInMs / 1000)} detik`,
        "info"
      );
      break;
    case "status":
      agentEvent(dataStream, event.message, "info");
      break;
    default:
      break;
  }
}

export function createPlatformWorkflowStreamResponse(input: {
  dispatch: PlatformChatDispatchInput;
  titlePromise?: Promise<string> | null;
  titleFallbackText?: string;
  consumeSseStream?: Parameters<
    typeof createUIMessageStreamResponse
  >[0]["consumeSseStream"];
}) {
  const stream = createUIMessageStream({
    execute: async ({ writer: dataStream }) => {
      bootstrapPlatformV2();

      agentStatus(dataStream, "Merencanakan workflow multi-agent");
      agentProgress(dataStream, 2);

      const { plan: rawPlan, source } = await generateExecutionPlan({
        userText: input.dispatch.userText,
        intent: input.dispatch.intent,
        openRouterApiKey: input.dispatch.openRouterApiKey,
        modelId: input.dispatch.plannerModelId,
        appUrl: input.dispatch.openRouterAppUrl,
      });

      const plan = normalizeExecutionPlan(
        rawPlan,
        input.dispatch.userText,
        input.dispatch.intent
      );

      const { runId } = await createWorkflowRun({
        userId: input.dispatch.userId,
        chatId: input.dispatch.chatId,
        plan,
        inputSummary: plan.summary,
        idempotencyKey: `chat:${input.dispatch.chatId}:${input.dispatch.userText.slice(0, 80).replace(/\s+/g, " ").trim()}`,
      });

      const totalSteps = plan.steps.length;
      const completedCount = { value: 0 };

      dataStream.write({
        type: "data-agent-activity",
        data: {
          kind: "event",
          message: `Rencana: ${plan.summary}`,
          level: "info",
          at: Date.now(),
        },
      });

      agentEvent(
        dataStream,
        plan.steps
          .map((s) => platformAgentLabel(s.agentId))
          .join(" → "),
        "info"
      );

      agentProgress(dataStream, 6);

      const processed = await processWorkflowRunToCompletion(
        runId,
        input.dispatch.userId,
        input.dispatch.chatId,
        {
          userText: input.dispatch.userText,
          onProgress: (event) => {
            if (event.type === "plan") {
              return;
            }
            emitProgress(dataStream, totalSteps, completedCount, event);
          },
        }
      );

      const [run, steps] = await Promise.all([
        getWorkflowRunById(runId),
        listStepsForRun(runId),
      ]);

      for (const step of steps) {
        if (step.status === "completed") {
          agentStepComplete(dataStream, step.stepKey);
        }
      }

      agentStepStart(dataStream, "respond", "Menyusun jawaban");
      agentProgress(dataStream, 94);

      const text = formatPlatformWorkflowReply({
        userText: input.dispatch.userText,
        planSummary: plan.summary,
        planSource: source,
        processed,
        steps,
        run,
      });

      const textId = generateId();
      dataStream.write({ type: "text-start", id: textId });
      for (const chunk of text.match(/.{1,48}/gs) ?? [text]) {
        dataStream.write({ type: "text-delta", id: textId, delta: chunk });
      }
      dataStream.write({ type: "text-end", id: textId });

      agentStepComplete(dataStream, "respond");
      agentProgress(dataStream, 100);
      agentStatus(dataStream, "Multi-Agent Workflow selesai");

      dataStream.write({
        type: "data-agent-activity",
        data: {
          kind: "event",
          message: `Workflow ${processed.status}`,
          level: processed.status === "completed" ? "success" : "info",
          at: Date.now(),
        },
      });

      await applyChatTitle({
        chatId: input.dispatch.chatId,
        titlePromise: input.titlePromise,
        fallbackText:
          input.titleFallbackText ?? input.dispatch.userText ?? text,
        writeTitle: (title) => {
          dataStream.write({ type: "data-chat-title", data: title });
        },
      });

      agentDone(dataStream);
    },
    generateId: generateUUID,
    onFinish: async ({ messages: finishedMessages }) => {
      if (finishedMessages.length === 0) {
        return;
      }
      await saveMessages({
        messages: finishedMessages.map((m) => ({
          id: m.id,
          chatId: input.dispatch.chatId,
          role: m.role,
          parts: m.parts,
          attachments: [],
          createdAt: new Date(),
        })),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: input.consumeSseStream,
  });
}

export function shouldUsePlatformWorkflowStream(
  input: PlatformChatDispatchInput
): boolean {
  if (!isPlatformChatWorkflowEnabled()) {
    return false;
  }
  return shouldRouteToPlatformWorkflow({
    intent: input.intent,
    userText: input.userText,
    attachmentKinds: input.attachmentKinds,
    bypassLlm: input.bypassLlm,
  });
}
