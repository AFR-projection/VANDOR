import { ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { autoSelectModel, fallbacksFor } from "@/lib/ai/auto-select";
import { isFreeTier, isOrchestratorTier } from "@/lib/ai/chat-modes";
import {
  entitlementsByUserType,
  isMessageLimitDisabled,
} from "@/lib/ai/entitlements";
import { resolveIntegrationModels } from "@/lib/ai/integration-models";
import { resolveMemoryExtractionModel } from "@/lib/ai/memory-model";
import { formatOpenRouterError } from "@/lib/ai/model-fallbacks";
import { normalizeModelTier } from "@/lib/ai/model-tiers";
import {
  chatModels,
  getCapabilities,
  resolveChatModelId,
} from "@/lib/ai/models";
import { buildFreeModeAttemptChain } from "@/lib/ai/openrouter-routing";
import {
  isHeavyForFreeMode,
  planOrchestrator,
  resolveFreeModeModel,
} from "@/lib/ai/orchestrator";
import { polishResponse } from "@/lib/ai/polish";
import { systemPrompt } from "@/lib/ai/prompts";
import { buildOwnerAuthorityBlock } from "@/lib/ai/owner-authority-prompt";
import { buildOwnerConversationFreedomBlock } from "@/lib/ai/system-security-fence";
import { resolveOpenRouterApiKeyForUser } from "@/lib/ai/providers";
import { classifyTaskIntent } from "@/lib/ai/router";
import { streamTextWithModelFallback } from "@/lib/ai/stream-with-fallback";
import { makeAssistantTools } from "@/lib/ai/tools/assistant-tools";
import { createDocument } from "@/lib/ai/tools/create-document";
import { createDocx } from "@/lib/ai/tools/create-docx";
import { createPdf } from "@/lib/ai/tools/create-pdf";
import { createSpreadsheet } from "@/lib/ai/tools/create-spreadsheet";
import { makeDownloadMediaTool } from "@/lib/ai/tools/download-media";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { getCurrentTime } from "@/lib/ai/tools/get-current-time";
import { makeGetLocation } from "@/lib/ai/tools/get-location";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  makeCreateWhatsappStickerTool,
  makeEditImageTool,
  makeGenerateImageTool,
  makeGenerateVideoTool,
  makeGenerateVoiceTool,
  makeTranscribeAudioTool,
} from "@/lib/ai/tools/media-tools";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { showMap } from "@/lib/ai/tools/show-map";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { makeWebSearch } from "@/lib/ai/tools/web-search";
import {
  getCachedResponse,
  setCachedResponse,
} from "@/lib/cache/response-cache";
import { parseMediaSlash } from "@/lib/chat/media-slash";
import { shouldPersistChatMessage } from "@/lib/chat/message-visibility";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { buildFilesContextBlock, extractAll } from "@/lib/files/extract";
import { inlineLocalAttachments } from "@/lib/files/inline";
import { classify, type FileKind } from "@/lib/files/mime";
import { createMediaDownloadStreamResponse } from "@/lib/media/chat-stream";
import { buildMemoryContext } from "@/lib/memory/build-context";
import {
  extractAndStoreMemories,
  preExtractUserMemories,
  runMemoryHygieneIfEnabled,
} from "@/lib/memory/extract";
import { memorySavedDataPart } from "@/lib/memory/notice";
import { isExplicitRememberRequest } from "@/lib/memory/remember";
import { maybeSummarizeChat } from "@/lib/memory/summarize";
import { captureVisualMemories } from "@/lib/memory/visual-memory";
import {
  agentDone,
  agentEvent,
  agentProgress,
  agentStatus,
  agentStepComplete,
  agentStepStart,
  agentTrace,
} from "@/lib/agent-activity/emit";
import { toolActivityLabel } from "@/lib/agent-activity/labels";
import { parseToolRunsFromMessage } from "@/lib/observability/parse-message-tools";
import { recordActivityLog, recordToolEvent } from "@/lib/observability/record";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { getWebSearchSynthesisModel } from "@/lib/search/config";
import {
  buildWebSearchContextBlock,
  getWebSearchAnswerInstructions,
} from "@/lib/search/context";
import {
  classifyContentIntents,
  classifyResponseMode,
  detectWebSearchNeed,
  shouldDisableWebSearchTool,
} from "@/lib/search/detect";
import { runWebSearch } from "@/lib/search/engine";
import { geocodePlace } from "@/lib/search/geocode";
import { generateRelatedQuestions } from "@/lib/search/related";
import { buildRichContent, hasRichContent } from "@/lib/search/rich";
import type { RichContent, WebSearchOutput } from "@/lib/search/types";
import { requireClientAccess } from "@/lib/security/client-access";
import { resolveClientGeo } from "@/lib/security/geo";
import { getUserSettings } from "@/lib/settings/queries";
import { resolveSettingsUserId } from "@/lib/settings/settings-scope";
import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";
import type { ChatMessage } from "@/lib/types";
import {
  convertToUIMessages,
  generateUUID,
  getTextFromMessage,
} from "@/lib/utils";
import { executeDirectCommand, parseDirectCommand } from "@/lib/v4/commands";
import { V4_MAX_AGENT_STEPS } from "@/lib/v4/constants";
import { createFastTextStreamResponse } from "@/lib/v4/fast-stream";
import { resolveVandorIntent } from "@/lib/v4/intent";
import { V4_JARVIS_OS_BLOCK } from "@/lib/v4/jarvis-prompt";
import { applyV4ModelBias } from "@/lib/v4/model-pick";
import {
  maxOutputTokensForTurn,
  shouldPolishResponse,
  shouldRunPreExtract,
} from "@/lib/v4/overhead";
import { selectActiveTools } from "@/lib/v4/tool-router";
import { trimUiMessagesForModel } from "@/lib/v4/trim-messages";
import { estimateTurnUsage } from "@/lib/v4/turn-usage";
import {
  buildSkillPromptLines,
  buildSkillTools,
} from "@/lib/agent-skills/build-tools";
import { listActiveAgentSkills } from "@/lib/agent-skills/queries";
import { ensureBuiltinSkills } from "@/lib/agent-skills/seed";
import { toSkillToolName } from "@/lib/agent-skills/types";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 120;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (err) {
    console.error("[chat] invalid request body:", err);
    return new ChatbotError(
      "bad_request:api",
      "Format pesan tidak valid (cek lampiran file / teks kosong)."
    ).toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel } = requestBody;
    const selectedVisibilityType = "private" as const;

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const accessDenied = await requireClientAccess(request);
    if (accessDenied) {
      return accessDenied;
    }

    const initialChatModel = await resolveChatModelId(selectedChatModel);

    await checkIpRateLimit(ipAddress(request));

    const userType: UserType = session.user.type;

    if (!isMessageLimitDisabled()) {
      const messageCount = await getMessageCountByUserId({
        id: session.user.id,
        differenceInHours: 1,
      });
      const limit = entitlementsByUserType[userType].maxMessagesPerHour;
      if (messageCount >= limit) {
        return new ChatbotError("rate_limit:chat").toResponse();
      }
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { geo: ipGeo, hints: requestHints } = await resolveClientGeo(request);

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const lastUserMessage = [...uiMessages]
      .reverse()
      .find((m) => m.role === "user");
    const lastUserText =
      message?.role === "user"
        ? getTextFromMessage(message)
        : lastUserMessage
          ? getTextFromMessage(lastUserMessage)
          : "";

    const mediaSlash =
      !isToolApprovalFlow && lastUserText.trim()
        ? parseMediaSlash(lastUserText)
        : null;

    const consumeSseStream = async ({
      stream: sseStream,
    }: {
      stream: ReadableStream;
    }) => {
      if (!process.env.REDIS_URL) {
        return;
      }
      try {
        const streamContext = getStreamContext();
        if (streamContext) {
          const streamId = generateId();
          await createStreamId({ streamId, chatId: id });
          await streamContext.createNewResumableStream(
            streamId,
            () => sseStream
          );
        }
      } catch (_) {
        /* non-critical */
      }
    };

    if (mediaSlash) {
      return createMediaDownloadStreamResponse({
        chatId: id,
        userId: session.user.id,
        slash: mediaSlash,
        consumeSseStream,
      });
    }

    // Vault Session enforcement (DB-level, not message-derived):
    // - chat.mode === "vault"        → isolated session, AI disabled, only vault commands
    // - chat.mode === "vault-locked" → terminated session, reject all writes
    const chatMode = chat?.mode ?? "chat";

    if (chatMode === "vault-locked") {
      return new ChatbotError(
        "forbidden:chat",
        "Vault session ini sudah dikunci permanen. Mulai sesi baru atau gunakan `/v` di chat lain."
      ).toResponse();
    }

    const vaultModeActive = chatMode === "vault";

    const directCmd =
      !isToolApprovalFlow && lastUserText.trim()
        ? parseDirectCommand(lastUserText, requestHints, id, {
            vaultMode: vaultModeActive,
          })
        : null;

    // Special handling for vault_enter when NOT in vault chat:
    // → create new isolated vault chat and tell client to redirect.
    if (directCmd?.kind === "vault_enter" && !vaultModeActive) {
      const { startVaultSession } = await import("@/lib/vault/session");
      const result = await startVaultSession(session.user.id);
      return createFastTextStreamResponse({
        chatId: id,
        instant: { label: "Vault Mode", phase: "start" },
        text: "",
        extraParts: [
          {
            type: "data-vault-session-redirect",
            data: {
              chatId: result.chatId,
              redirectTo: result.redirectTo,
              reason: "enter",
            },
          },
        ],
        consumeSseStream,
      });
    }

    // Special handling for vault_exit while IN vault chat:
    // → lock current chat, tell client to redirect to a fresh new chat.
    if (directCmd?.kind === "vault_exit" && vaultModeActive) {
      const { updateChatMode } = await import("@/lib/db/queries");
      await updateChatMode({ chatId: id, mode: "vault-locked" });
      const newChatId = generateUUID();
      return createFastTextStreamResponse({
        chatId: id,
        instant: { label: "Chat Mode", phase: "start" },
        text: "",
        extraParts: [
          {
            type: "data-vault-mode-exit",
            data: {
              exitedAt: new Date().toISOString(),
              reason: "user",
            },
          },
          {
            type: "data-vault-session-redirect",
            data: {
              chatId: newChatId,
              redirectTo: `/chat/${newChatId}`,
              reason: "exit",
            },
          },
        ],
        consumeSseStream,
      });
    }

    if (directCmd && directCmd.kind !== "media") {
      const executed = await executeDirectCommand(directCmd, {
        userId: session.user.id,
        chatId: id,
      });
      return createFastTextStreamResponse({
        chatId: id,
        instant: { label: executed.instantLabel, phase: "start" },
        text: executed.text,
        extraParts: executed.extraParts,
        consumeSseStream,
      });
    }

    // HARD ISOLATION: in Vault session, NO LLM calls, NO memory, NO retrieval.
    // Even if directCmd is null (e.g. user typed random text), reject it.
    if (vaultModeActive && !isToolApprovalFlow) {
      const { vaultDeniedDataPart } = await import("@/lib/vault/notice");
      return createFastTextStreamResponse({
        chatId: id,
        instant: { label: "Vault Mode", phase: "start" },
        text: "",
        extraParts: [
          vaultDeniedDataPart({
            attempted: lastUserText.slice(0, 120),
            reason:
              "Vault Session aktif — AI dimatikan. Hanya command Vault yang tersedia (`list`, `read <id>`, `add`, `update <id> ...`, `delete <id>`). Ketik `exit` untuk mengakhiri sesi & mulai chat baru.",
          }),
        ],
        consumeSseStream,
      });
    }

    // ── Multi-format attachment ingestion ───────────────────────────────
    const attachedFiles = (lastUserMessage?.parts ?? [])
      .filter(
        (
          p
        ): p is {
          type: "file";
          mediaType: string;
          name: string;
          url: string;
        } => (p as { type?: string }).type === "file"
      )
      .map((p) => ({
        url: p.url,
        name: (p as { filename?: string; name?: string }).filename ??
          (p as { name?: string }).name ??
          "file",
        mime: p.mediaType,
      }));

    const { getActiveVaultOpen } = await import("@/lib/vault/chat-context");
    const activeVault = getActiveVaultOpen(uiMessages);
    const isVaultSlash =
      /^\/?v\s+(list|get|del|up|open|uploaded)\b/i.test(lastUserText.trim()) ||
      /^\/?(?:share-to-ai|ai-read|share2ai)\s+/i.test(lastUserText.trim()) ||
      vaultModeActive;
    if (
      attachedFiles.length === 0 &&
      activeVault &&
      !isVaultSlash
    ) {
      attachedFiles.push({
        url: activeVault.openUrl,
        name: activeVault.file.name,
        mime: activeVault.file.mimeType,
      });
    }

    const extractedFiles = attachedFiles.length
      ? await extractAll(attachedFiles, session.user.id)
      : [];
    const filesBlock = buildFilesContextBlock(extractedFiles);
    const attachmentKinds: FileKind[] = attachedFiles.map((a) =>
      classify(a.mime, a.name)
    );

    const settingsUserId = await resolveSettingsUserId(session.user.id);
    const userSettings = await getUserSettings(settingsUserId);
    const deploymentOwner = await resolveDeploymentOwnerUser();
    const ownerAuthorityBlock = buildOwnerAuthorityBlock({
      isDeploymentOwner: deploymentOwner?.id === settingsUserId,
      ownerEmail: deploymentOwner?.email,
    });
    const ownerFreedomBlock = buildOwnerConversationFreedomBlock({
      isDeploymentOwner: deploymentOwner?.id === settingsUserId,
    });
    const openRouterApiKey = await resolveOpenRouterApiKeyForUser(
      settingsUserId
    );

    if (!openRouterApiKey?.trim()) {
      return new ChatbotError(
        "bad_request:api",
        "OpenRouter API key belum dikonfigurasi. Isi di Pengaturan → API & integrasi, atau set OPENROUTER_API_KEY di .env.local lalu restart server."
      ).toResponse();
    }

    const memoryEnabled = userSettings.memory.enabled;
    const memoryAutoExtract = userSettings.memory.autoExtract;

    const userTextsInChat = uiMessages
      .filter((m) => m.role === "user")
      .map((m) => getTextFromMessage(m).trim())
      .filter(Boolean);
    const lastAssistantInChat = [...uiMessages]
      .reverse()
      .find((m) => m.role === "assistant");
    const webSearchConversation = {
      priorUserTexts: userTextsInChat.slice(0, -1),
      lastAssistantText: lastAssistantInChat
        ? getTextFromMessage(lastAssistantInChat).trim()
        : undefined,
    };

    let webSearchDetection =
      !isToolApprovalFlow && lastUserText.trim()
        ? detectWebSearchNeed(lastUserText, webSearchConversation)
        : { needed: false as const, query: "" };

    if (!userSettings.advanced.webSearchAuto) {
      webSearchDetection = {
        ...webSearchDetection,
        needed: false,
        reason: "disabled_in_settings",
      };
    }

    const v4Intent = resolveVandorIntent({
      userText: lastUserText,
      attachmentKinds,
      webSearchActive: webSearchDetection.needed,
    });

    const explicitRemember = isExplicitRememberRequest(lastUserText);
    const preExtractOn = shouldRunPreExtract({
      enabled:
        memoryEnabled &&
        memoryAutoExtract &&
        userSettings.memory.preExtractFromUser !== false,
      intent: v4Intent.intent,
      userText: lastUserText,
      isRemember: explicitRemember,
    });

    const mergeSimilar = userSettings.memory.mergeSimilarMemories !== false;

    const activeTier = normalizeModelTier(initialChatModel);
    const integrationModels = resolveIntegrationModels(
      userSettings.integrations,
      activeTier
    );
    const openRouterMeta = {
      appName: userSettings.integrations.openrouterAppName.trim() || "VANDOR",
      appUrl:
        userSettings.integrations.openrouterAppUrl.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.OPENROUTER_APP_URL?.trim() ||
        "http://localhost:3000",
    };
    const memoryExtractionModelId =
      resolveMemoryExtractionModel(integrationModels);

    const preExtractInput = {
      userId: session.user.id,
      userMessage: lastUserText,
      chatId: id,
      maxPerTurn: Math.min(userSettings.memory.maxExtractPerTurn, 2),
      openRouterApiKey,
      modelId: memoryExtractionModelId,
      meta: openRouterMeta,
      mergeSimilar,
    };

    let preSavedItems: Awaited<ReturnType<typeof preExtractUserMemories>> = [];

    const memoryContextPromise = buildMemoryContext({
      userId: session.user.id,
      query: lastUserText,
      chatId: id,
    });

    let memoryContext: string;
    if (preExtractOn && explicitRemember) {
      const [saved, ctx] = await Promise.all([
        preExtractUserMemories(preExtractInput).catch(() => []),
        memoryContextPromise,
      ]);
      preSavedItems = saved;
      memoryContext = ctx;
    } else {
      if (preExtractOn) {
        preExtractUserMemories(preExtractInput).catch(() => null);
      }
      memoryContext = await memoryContextPromise;
    }

    const allowRichUI = userSettings.advanced.richContentLevel !== "minimal";

    const contentIntents =
      !isToolApprovalFlow && lastUserText.trim()
        ? classifyContentIntents(lastUserText)
        : {
            images: false,
            news: false,
            video: false,
            product: false,
            location: false,
            website: false,
          };

    // When the user uploads a file (e.g. "identify this image"), they want
    // analysis of their upload — not a gallery of unrelated search images.
    if (attachedFiles.length > 0) {
      contentIntents.images = false;
    }

    const responseMode =
      !isToolApprovalFlow && lastUserText.trim()
        ? classifyResponseMode(lastUserText)
        : "enhanced";

    const taskIntent = classifyTaskIntent(lastUserText, {
      webSearchActive: webSearchDetection.needed,
    });

    const contextChars =
      lastUserText.length + filesBlock.length + memoryContext.length;
    const autoSelectBase = {
      attachmentKinds,
      contextChars,
      visionModelId:
        integrationModels.visionModel ||
        integrationModels.chatModel ||
        "google/gemini-2.5-flash",
      longContextModelId:
        integrationModels.longContextModel ||
        integrationModels.chatModel ||
        "google/gemini-2.5-flash",
    };

    let chatModel: string;
    let orchestratorAgentId: string | null = null;
    let orchestratorAgentName: string | null = null;
    let selectionReason: string | null = null;
    let selectionOverridden = false;
    let freeModeFallbacks: string[] = [];
    let freeHeavyReason: string | null = null;
    const requestedMode = initialChatModel;

    const freeAttemptChainEarly = isFreeTier(initialChatModel)
      ? buildFreeModeAttemptChain({
          freeModel1: integrationModels.freeModel1,
          freeModel2: integrationModels.freeModel2,
          freeModel3: integrationModels.freeModel3,
        })
      : undefined;

    if (isFreeTier(initialChatModel)) {
      const freePick = resolveFreeModeModel(
        attachmentKinds,
        integrationModels,
        {
          userText: lastUserText,
          contextChars,
        }
      );
      chatModel = freeAttemptChainEarly?.[0] ?? freePick.modelId;
      freeModeFallbacks = freePick.fallbacks;
      selectionReason =
        freePick.reason ??
        `Gratis: rotasi ${freeAttemptChainEarly?.length ?? 15} model :free`;

      const heavy = isHeavyForFreeMode({
        userText: lastUserText,
        attachmentKinds,
        contextChars,
      });
      if (heavy.heavy) {
        freeHeavyReason = heavy.reason;
        selectionReason = `Gratis: ${heavy.reason} — coba tier Hemat atau Seimbang`;
      }
    } else if (isOrchestratorTier(initialChatModel)) {
      const plan = planOrchestrator({
        userText: lastUserText,
        attachmentKinds,
        contextChars,
        webSearchActive: webSearchDetection.needed,
        integrationModels,
      });
      orchestratorAgentId = plan.agentId;
      orchestratorAgentName = plan.agentName;
      selectionReason = plan.reason;

      const auto = await autoSelectModel({
        ...autoSelectBase,
        selectedModelId: plan.modelId,
      });
      chatModel = auto.overridden ? auto.modelId : plan.modelId;
      if (auto.reason) {
        selectionReason = auto.reason;
        selectionOverridden = true;
      }
    } else {
      const auto = await autoSelectModel({
        ...autoSelectBase,
        selectedModelId: initialChatModel,
      });
      chatModel = auto.overridden ? auto.modelId : initialChatModel;
      selectionReason = auto.reason;
      selectionOverridden = auto.overridden;
    }

    const v4Model = applyV4ModelBias({
      modelId: chatModel,
      intent: v4Intent.intent,
      models: integrationModels,
      webSearchPreloaded: webSearchDetection.needed,
      useOrchestrator: isOrchestratorTier(initialChatModel),
    });
    if (v4Model.modelId !== chatModel) {
      chatModel = v4Model.modelId;
      selectionReason = v4Model.reason ?? selectionReason;
    }

    const modelConfig = chatModels.find((m) => m.id === chatModel);
    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools !== false;

    const freeModeActive = isFreeTier(initialChatModel);
    const treatAsFreeTier =
      freeModeActive ||
      modelConfig?.tier === "free" ||
      chatModel.includes(":free") ||
      chatModel === "openrouter/free";

    const fallbackExtras = freeModeActive
      ? freeModeFallbacks.filter((id) => id && id !== chatModel)
      : [
          ...(fallbacksFor[chatModel] ?? []),
          integrationModels.chatModel,
          integrationModels.reasoningModel,
        ].filter(
          (id, i, arr) => id && id !== chatModel && arr.indexOf(id) === i
        );

    const documentModelId = freeModeActive
      ? chatModel
      : integrationModels.documentModel ||
        integrationModels.codingModel ||
        chatModel;

    const freeAttemptChain = freeAttemptChainEarly;

    // Replace `/storage/...` URLs (unreachable from external LLM providers)
    // with inline base64 data URLs so the model actually receives the bytes.
    const trimmedUi = trimUiMessagesForModel(uiMessages);
    const inlinedMessages = await inlineLocalAttachments(
      trimmedUi,
      session.user.id
    );
    const modelMessages = await convertToModelMessages(inlinedMessages);

    let webSourcesPayload: WebSearchOutput | null = null;
    let richContentPayload: RichContent | null = null;

    const canUseResponseCache =
      userSettings.advanced.responseCache &&
      process.env.VANDOR_DISABLE_RESPONSE_CACHE !== "1" &&
      !isToolApprovalFlow &&
      attachedFiles.length === 0 &&
      !webSearchDetection.needed &&
      lastUserText.trim().length >= 10 &&
      lastUserText.trim().length <= 500 &&
      taskIntent === "simple";

    const maxOutputThisTurn =
      maxOutputTokensForTurn({
        responseMode,
        webSearchPreloaded: webSearchDetection.needed,
      }) ?? 3072;

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        if (preSavedItems.length > 0) {
          dataStream.write(
            memorySavedDataPart({ items: preSavedItems, source: "pre" })
          );
        }

        dataStream.write({
          type: "data-model-meta",
          data: {
            modelId: chatModel,
            requestedModelId: requestedMode,
            chatMode: activeTier,
            modelTier: activeTier,
            agentId: orchestratorAgentId,
            agentName: orchestratorAgentName,
            overridden: selectionOverridden,
            reason: selectionReason,
            fallbackChain: freeAttemptChain,
            attachments: extractedFiles.map((f) => ({
              name: f.name,
              kind: f.kind,
              bytes: f.bytes,
              extracted: Boolean(f.text),
              truncated: f.truncated,
              error: f.error,
            })),
          },
        });

        agentStepStart(dataStream, "understand", "Memahami permintaan");
        agentStatus(dataStream, "Memproses permintaan");
        agentProgress(dataStream, 8);

        if (memoryContext.length > 0) {
          agentStepComplete(dataStream, "understand");
          agentStepStart(dataStream, "memory", "Mengambil konteks memori");
          agentEvent(
            dataStream,
            `Memuat ${memoryContext.length} karakter memori`,
            "info"
          );
          agentStepComplete(dataStream, "memory");
          agentProgress(dataStream, 18);
        }

        let webSearchContextBlock = "";
        let webSearchRetryHint = "";
        let relatedPromise: Promise<string[]> | null = null;

        if (
          !isToolApprovalFlow &&
          lastUserText.trim() &&
          webSearchDetection.needed
        ) {
          const detection = webSearchDetection;
          if (detection.needed) {
            dataStream.write({
              type: "data-search-status",
              data: { status: "searching", query: detection.query },
            });
            agentStepStart(dataStream, "web-search", "Mencari sumber");
            agentStatus(dataStream, "Mencari sumber");
            agentTrace(dataStream, "Mencari sumber relevan");
            if (detection.query) {
              agentEvent(
                dataStream,
                `Query: ${detection.query.slice(0, 80)}`,
                "info"
              );
            }
            agentProgress(dataStream, 28);

            const searchResult = await runWebSearch(detection.query, {
              userId: session.user.id,
              maxResults: 5,
              intents: {
                images: contentIntents.images,
                news: contentIntents.news,
              },
            });

            if (searchResult.sources.length > 0) {
              webSourcesPayload = searchResult;
              dataStream.write({
                type: "data-web-sources",
                data: searchResult,
              });
              agentStepComplete(dataStream, "web-search");
              agentStepStart(dataStream, "read-sources", "Membaca sumber");
              agentEvent(
                dataStream,
                `Menemukan ${searchResult.sources.length} sumber`,
                "success"
              );
              agentStepComplete(dataStream, "read-sources");
              agentTrace(dataStream, "Membandingkan informasi");
              agentProgress(dataStream, 45);

              if (allowRichUI) {
                const rich = buildRichContent(searchResult, contentIntents);

                if (contentIntents.location) {
                  const geo = await geocodePlace(detection.query);
                  if (geo) {
                    rich.locations = [
                      {
                        name: detection.query,
                        address: geo.displayName,
                        description: searchResult.sources[0]?.snippet,
                        image: searchResult.images?.[0]?.url,
                        lat: geo.lat,
                        lng: geo.lng,
                        mapUrl: geo.osmUrl,
                      },
                    ];
                  }
                }

                if (hasRichContent(rich)) {
                  richContentPayload = rich;
                  dataStream.write({
                    type: "data-rich-content",
                    data: rich,
                  });
                }

                const snippets = searchResult.sources
                  .map((s) => `${s.title}: ${s.snippet}`)
                  .join("\n")
                  .slice(0, 1500);
                relatedPromise = generateRelatedQuestions(
                  lastUserText,
                  snippets,
                  openRouterApiKey
                );
              }

              webSearchContextBlock = [
                "=== WEB SEARCH RESULTS (authoritative, use for your answer) ===",
                buildWebSearchContextBlock(searchResult.sources),
                getWebSearchAnswerInstructions(searchResult.sources.length),
              ].join("\n\n");
            } else {
              webSearchRetryHint = [
                "=== WEB SEARCH REMINDER ===",
                "Pencarian otomatis tidak menemukan sumber. Sebelum bilang tidak bisa akses data live, WAJIB panggil tool webSearch dengan query lebih spesifik (bahasa Inggris sering lebih baik untuk skor olahraga internasional).",
              ].join("\n");
            }

            dataStream.write({
              type: "data-search-status",
              data: { status: "complete", query: detection.query },
            });
          }
        }

        const assistantTools = makeAssistantTools(session.user.id, id);

        if (canUseResponseCache) {
          const cached = await getCachedResponse({
            userId: session.user.id,
            modelId: chatModel,
            query: lastUserText,
          });

          if (cached) {
            const textId = generateId();
            dataStream.write({ type: "text-start", id: textId });
            for (const chunk of cached.match(/.{1,24}/gs) ?? [cached]) {
              dataStream.write({
                type: "text-delta",
                id: textId,
                delta: chunk,
              });
            }
            dataStream.write({ type: "text-end", id: textId });

            dataStream.write({
              type: "data-turn-usage",
              data: estimateTurnUsage({
                memoryContextChars: memoryContext.length,
                filesContextChars: filesBlock.length,
                webContextChars: 0,
                userTextChars: lastUserText.length,
                messageCount: trimmedUi.length,
                maxOutputTokens: maxOutputThisTurn,
                intent: v4Intent.intent,
              }),
            });

            if (memoryContext.length > 0) {
              dataStream.write({
                type: "data-memory-recall",
                data: { active: true, charCount: memoryContext.length },
              });
            }

            if (titlePromise) {
              try {
                const title = await titlePromise;
                dataStream.write({ type: "data-chat-title", data: title });
                updateChatTitleById({ chatId: id, title });
              } catch (_) {
                /* non-fatal */
              }
            }
            return;
          }
        }

        const webSearchToolOff =
          webSearchContextBlock.length > 0 ||
          shouldDisableWebSearchTool(lastUserText);

        const instantLabels: Record<string, string> = {
          search: "Mencari di web",
          weather: "Mengecek cuaca",
          time: "Mengecek waktu",
          task: "Mengelola task",
          vault: "Berangkas pribadi",
          document: "Menyiapkan dokumen",
          code: "Menulis kode",
          image: "Memproses gambar",
          pdf: "Membuat file",
          map: "Memuat peta",
          chat_simple: "Memproses",
          chat_reasoning: "Menganalisis",
        };

        dataStream.write({
          type: "data-instant-status",
          data: {
            label: instantLabels[v4Intent.intent] ?? "VANDOR",
            phase: "start",
          },
        });
        agentStepComplete(dataStream, "understand");
        agentStatus(
          dataStream,
          instantLabels[v4Intent.intent] ?? "Memproses permintaan"
        );
        agentStepStart(
          dataStream,
          "prepare",
          instantLabels[v4Intent.intent] ?? "Memproses permintaan"
        );
        agentProgress(dataStream, 52);

        let activeTools = selectActiveTools({
          intent: v4Intent.intent,
          hasAttachments: attachedFiles.length > 0,
          webSearchPreloaded: webSearchContextBlock.length > 0,
          webSearchDisabled: webSearchToolOff,
          supportsTools,
          userText: lastUserText,
        });

        if (webSearchToolOff) {
          activeTools = activeTools.filter((t) => t !== "webSearch");
        }

        let activeSkills: Awaited<ReturnType<typeof listActiveAgentSkills>> =
          [];
        let skillToolNames: ReturnType<typeof toSkillToolName>[] = [];
        let skillToolsBlock = "";
        let skillTools: ReturnType<typeof buildSkillTools> = {};

        if (supportsTools) {
          try {
            await ensureBuiltinSkills(settingsUserId);
            activeSkills = await listActiveAgentSkills(settingsUserId);
            skillToolNames = activeSkills.map((s) => toSkillToolName(s.slug));
            skillToolsBlock =
              activeSkills.length > 0
                ? `\n\n## Custom Agent Skills\n${buildSkillPromptLines(activeSkills).join("\n")}\nPilih skill yang paling relevan. Isi parameter otomatis dari konteks user.`
                : "";
            skillTools = buildSkillTools(activeSkills, {
              userId: settingsUserId,
              chatId: id,
            });
          } catch {
            // Skills DB belum siap — chat tetap jalan tanpa custom tools
          }
        }

        const allActiveTools = supportsTools
          ? ([...activeTools, ...skillToolNames] as typeof activeTools)
          : activeTools;

        const synthesisModelId =
          webSearchContextBlock.length > 0
            ? getWebSearchSynthesisModel(
                chatModel,
                integrationModels.researchModel
              )
            : chatModel;

        const streamPrimaryId = freeModeActive
          ? (freeAttemptChain?.[0] ?? synthesisModelId)
          : synthesisModelId;

        const { stream, resolvedModelId, attemptIndex, attemptedModels } =
          await streamTextWithModelFallback({
            primaryModelId: streamPrimaryId,
            apiKey: openRouterApiKey,
            meta: {
              appName: userSettings.integrations.openrouterAppName,
              appUrl: userSettings.integrations.openrouterAppUrl,
            },
            freeMode: freeModeActive,
            isFreeTier: treatAsFreeTier,
            extraFallbacks: fallbackExtras,
            attemptModelIds: freeAttemptChain,
            reasoningEffort:
              !freeModeActive && modelConfig?.reasoningEffort
                ? modelConfig.reasoningEffort
                : undefined,
            system:
              systemPrompt({
                requestHints,
                supportsTools,
                memoryContext,
                filesContext: filesBlock,
                webSearchContext: webSearchContextBlock,
                webSearchRetryHint,
                responseMode,
                persona: userSettings.persona,
                activeTools,
                ownerAuthorityBlock,
                ownerFreedomBlock,
              }) +
              skillToolsBlock +
              `\n\n${V4_JARVIS_OS_BLOCK}\n\nTools aktif: ${allActiveTools.length}.` +
              (freeModeActive
                ? `\n\n=== TIER GRATIS ===\nVANDOR mencoba ${freeAttemptChain?.length ?? 15} model :free bergantian (Llama 3.3, GPT-OSS, Nemotron, Kimi, dll.) sampai ada respons.${
                    freeHeavyReason
                      ? ` Permintaan ini terdeteksi berat (${freeHeavyReason}). Kerjakan seadanya secara singkat, lalu SARANKAN tier Hemat atau Seimbang di picker model untuk hasil lebih stabil.`
                      : " Jawab ringkas dan to the point."
                  }`
                : ""),
            messages: modelMessages,
            maxOutputTokens: maxOutputTokensForTurn({
              responseMode,
              webSearchPreloaded: webSearchContextBlock.length > 0,
            }),
            temperature: webSearchContextBlock.length > 0 ? 0.4 : undefined,
            stopWhen: stepCountIs(V4_MAX_AGENT_STEPS),
            experimental_activeTools:
              isReasoningModel && !supportsTools ? [] : allActiveTools,
            tools: {
              getCurrentTime,
              getLocation: makeGetLocation(ipGeo),
              getWeather,
              showMap,
              webSearch: makeWebSearch(session.user.id),
              downloadMedia: makeDownloadMediaTool(),
              ...assistantTools,
              ...skillTools,
              createDocument: createDocument({
                session,
                dataStream,
                modelId: documentModelId,
              }),
              editDocument: editDocument({ dataStream, session }),
              updateDocument: updateDocument({
                session,
                dataStream,
                modelId: documentModelId,
              }),
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
                modelId: chatModel,
              }),
              createPdf,
              createDocx,
              createSpreadsheet,
              generateImage: makeGenerateImageTool(session.user.id),
              editImage: makeEditImageTool(
                session.user.id,
                extractedFiles
                  .filter((f) => f.kind === "image")
                  .map((f) => f.url)
              ),
              generateVideo: makeGenerateVideoTool(session.user.id),
              generateVoice: makeGenerateVoiceTool(session.user.id),
              transcribeAudio: makeTranscribeAudioTool(session.user.id),
              createWhatsappSticker: makeCreateWhatsappStickerTool(
                session.user.id
              ),
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: "stream-text",
            },
            onStepFinish: ({ toolCalls, toolResults }) => {
              for (const call of toolCalls) {
                const name = call.toolName;
                agentStepStart(
                  dataStream,
                  call.toolCallId,
                  toolActivityLabel(name)
                );
                agentStatus(dataStream, toolActivityLabel(name));
                agentEvent(dataStream, `${toolActivityLabel(name)}…`, "info");
              }
              for (const result of toolResults) {
                agentStepComplete(dataStream, result.toolCallId);
                if (result.toolName === "webSearch") {
                  const output = result.output as
                    | { sources?: unknown[] }
                    | undefined;
                  const count = output?.sources?.length ?? 0;
                  if (count > 0) {
                    agentEvent(
                      dataStream,
                      `Menemukan ${count} sumber`,
                      "success"
                    );
                  }
                } else {
                  agentEvent(
                    dataStream,
                    `${toolActivityLabel(result.toolName)} selesai`,
                    "success"
                  );
                }
              }
              agentTrace(dataStream, "Menyusun jawaban");
              agentProgress(dataStream, 72);
            },
          });

        const usedFallback =
          attemptIndex > 0 || resolvedModelId !== synthesisModelId;

        dataStream.merge(
          stream.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        agentStepComplete(dataStream, "prepare");
        agentStepStart(dataStream, "generate", "Menyusun jawaban");
        agentStatus(dataStream, "Menyusun jawaban");
        agentTrace(dataStream, "Menyusun jawaban");
        agentProgress(dataStream, 88);

        dataStream.write({
          type: "data-model-meta",
          data: {
            modelId: resolvedModelId,
            requestedModelId: requestedMode,
            chatMode: activeTier,
            modelTier: activeTier,
            agentId: orchestratorAgentId,
            agentName: orchestratorAgentName,
            overridden: selectionOverridden || usedFallback,
            reason:
              usedFallback && freeModeActive && attemptIndex > 0
                ? `Rotasi Gratis: model #${attemptIndex + 1} dari ${attemptedModels.length} (${resolvedModelId.split("/").pop()})`
                : selectionReason,
            fallbackUsed: usedFallback,
            attemptIndex: usedFallback ? attemptIndex : undefined,
            attemptTotal: usedFallback ? attemptedModels.length : undefined,
            fallbackChain: usedFallback ? attemptedModels : freeAttemptChain,
            attachments: extractedFiles.map((f) => ({
              name: f.name,
              kind: f.kind,
              bytes: f.bytes,
              extracted: Boolean(f.text),
              truncated: f.truncated,
              error: f.error,
            })),
          },
        });

        dataStream.write({
          type: "data-turn-usage",
          data: estimateTurnUsage({
            memoryContextChars: memoryContext.length,
            filesContextChars: filesBlock.length,
            webContextChars: webSearchContextBlock.length,
            userTextChars: lastUserText.length,
            messageCount: trimmedUi.length,
            maxOutputTokens: maxOutputThisTurn,
            intent: v4Intent.intent,
          }),
        });

        if (memoryContext.length > 0) {
          dataStream.write({
            type: "data-memory-recall",
            data: { active: true, charCount: memoryContext.length },
          });
        }

        if (relatedPromise) {
          try {
            const related = await relatedPromise;
            if (related.length > 0) {
              dataStream.write({
                type: "data-rich-content",
                data: { relatedQuestions: related },
              });
              richContentPayload = {
                ...(richContentPayload ?? {}),
                relatedQuestions: related,
              };
            }
          } catch (_) {
            /* non-fatal */
          }
        }

        if (titlePromise) {
          try {
            const title = await titlePromise;
            dataStream.write({ type: "data-chat-title", data: title });
            updateChatTitleById({ chatId: id, title });
          } catch (_) {
            /* non-fatal */
          }
        }

        agentStepComplete(dataStream, "generate");
        agentDone(dataStream);
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          const messagesToSave = finishedMessages
            .filter(shouldPersistChatMessage)
            .map((currentMessage) => {
              let parts = currentMessage.parts;

              if (
                currentMessage.role === "assistant" &&
                webSourcesPayload &&
                !parts.some((p) => p.type === "data-web-sources")
              ) {
                parts = [
                  {
                    type: "data-web-sources",
                    data: webSourcesPayload,
                  } as ChatMessage["parts"][number],
                  ...parts,
                ];
              }

              if (
                currentMessage.role === "assistant" &&
                richContentPayload &&
                hasRichContent(richContentPayload) &&
                !parts.some((p) => p.type === "data-rich-content")
              ) {
                parts = [
                  {
                    type: "data-rich-content",
                    data: richContentPayload,
                  } as ChatMessage["parts"][number],
                  ...parts,
                ];
              }

              return {
                id: currentMessage.id,
                role: currentMessage.role,
                parts,
                createdAt: new Date(),
                attachments: [],
                chatId: id,
              };
            });

          await saveMessages({ messages: messagesToSave });

          const assistantMsg = finishedMessages.find(
            (m) => m.role === "assistant"
          );
          if (assistantMsg && lastUserText) {
            const rawText = getTextFromMessage(assistantMsg);
            if (rawText.trim()) {
              if (
                shouldPolishResponse({
                  enabled: userSettings.advanced.responsePolish,
                  intent: v4Intent.intent,
                  responseMode,
                  webSearchPreloaded: Boolean(webSourcesPayload),
                })
              ) {
                polishResponse(rawText, openRouterApiKey)
                  .then(async (polished) => {
                    if (polished === rawText) {
                      return;
                    }
                    const polishedParts = assistantMsg.parts.map((part) =>
                      part.type === "text" ? { ...part, text: polished } : part
                    );
                    await updateMessage({
                      id: assistantMsg.id,
                      parts: polishedParts,
                    });
                  })
                  .catch(() => null);
              }

              if (canUseResponseCache) {
                setCachedResponse({
                  userId: session.user.id,
                  modelId: chatModel,
                  query: lastUserText,
                  response: rawText,
                }).catch(() => null);
              }
            }

            if (memoryEnabled && memoryAutoExtract) {
              const postSaved = await extractAndStoreMemories({
                userId: session.user.id,
                userMessage: lastUserText,
                assistantMessage: rawText,
                chatId: id,
                maxPerTurn: userSettings.memory.maxExtractPerTurn,
                openRouterApiKey,
                modelId: memoryExtractionModelId,
                meta: openRouterMeta,
                mergeSimilar,
              }).catch(
                () => [] as Awaited<ReturnType<typeof extractAndStoreMemories>>
              );

              if (postSaved.length > 0) {
                const memoryPart = memorySavedDataPart({
                  items: postSaved,
                  source: "post",
                });
                await updateMessage({
                  id: assistantMsg.id,
                  parts: [
                    ...assistantMsg.parts,
                    memoryPart as ChatMessage["parts"][number],
                  ],
                });
                await runMemoryHygieneIfEnabled(
                  session.user.id,
                  userSettings.memory.autoHygiene !== false
                );
              }
            }

            for (const run of parseToolRunsFromMessage(assistantMsg)) {
              recordToolEvent({
                userId: session.user.id,
                chatId: id,
                toolName: run.toolName,
                status: run.status,
                detail: run.detail,
              }).catch(() => null);
            }

            if (
              userSettings.visualMemory.enabled &&
              userSettings.visualMemory.autoCaptureFromImages &&
              extractedFiles.some((f) => f.kind === "image")
            ) {
              captureVisualMemories({
                userId: session.user.id,
                chatId: id,
                userMessage: lastUserText,
                imageFiles: extractedFiles.filter((f) => f.kind === "image"),
                maxVisualMemories: userSettings.visualMemory.maxVisualMemories,
              }).catch(() => null);
            }

            if (userSettings.advanced.conversationSummary) {
              maybeSummarizeChat({
                chatId: id,
                userId: session.user.id,
                openRouterApiKey,
              }).catch(() => null);
            }
          }
        }
      },
      onError: (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Chat stream error:", error);
        recordActivityLog({
          userId: session.user.id,
          chatId: id,
          source: "chat/stream",
          level: "error",
          message: "Stream chat gagal",
          detail: msg.slice(0, 4000),
        }).catch(() => null);
        return formatOpenRouterError(msg, chatModel);
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      (error.message?.includes("OPENROUTER") ||
        error.message?.includes("401") ||
        error.message?.includes("API key"))
    ) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
