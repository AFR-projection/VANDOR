import { geolocation, ipAddress } from "@vercel/functions";
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
import {
  entitlementsByUserType,
  isMessageLimitDisabled,
} from "@/lib/ai/entitlements";
import {
  chatModels,
  getCapabilities,
  resolveChatModelId,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import {
  resolveOpenRouterApiKeyForUser,
} from "@/lib/ai/providers";
import {
  buildWebSearchContextBlock,
  generalAnswerQualityInstructions,
  getWebSearchAnswerInstructions,
} from "@/lib/search/context";
import { getWebSearchSynthesisModel, WEB_SEARCH_SYNTHESIS_MAX_TOKENS } from "@/lib/search/config";
import {
  classifyContentIntents,
  classifyResponseMode,
  detectWebSearchNeed,
} from "@/lib/search/detect";
import type { RichContent, WebSearchOutput } from "@/lib/search/types";
import { runWebSearch } from "@/lib/search/engine";
import { buildRichContent, hasRichContent } from "@/lib/search/rich";
import { generateRelatedQuestions } from "@/lib/search/related";
import { geocodePlace } from "@/lib/search/geocode";
import { buildMemoryContext } from "@/lib/memory/build-context";
import {
  extractAndStoreMemories,
  preExtractUserMemories,
} from "@/lib/memory/extract";
import { isExplicitRememberRequest } from "@/lib/memory/remember";
import { maybeSummarizeChat } from "@/lib/memory/summarize";
import { captureVisualMemories } from "@/lib/memory/visual-memory";
import { getUserSettings } from "@/lib/settings/queries";
import { makeAssistantTools } from "@/lib/ai/tools/assistant-tools";
import { isFreeTier, isOrchestratorTier } from "@/lib/ai/chat-modes";
import { normalizeModelTier } from "@/lib/ai/model-tiers";
import { resolveIntegrationModels } from "@/lib/ai/integration-models";
import {
  isHeavyForFreeMode,
  planOrchestrator,
  resolveFreeModeModel,
} from "@/lib/ai/orchestrator";
import { polishResponse } from "@/lib/ai/polish";
import {
  getCachedResponse,
  setCachedResponse,
} from "@/lib/cache/response-cache";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { getCurrentTime } from "@/lib/ai/tools/get-current-time";
import { makeGetLocation } from "@/lib/ai/tools/get-location";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { showMap } from "@/lib/ai/tools/show-map";
import { webSearch } from "@/lib/ai/tools/web-search";
import { requireClientAccess } from "@/lib/security/client-access";
import { getClientIp } from "@/lib/security/gate-edge";
import { lookupIpGeo } from "@/lib/security/geo";
import { VANDOR_CHAT_TOOLS } from "@/lib/ai/tools/registry";
import { autoSelectModel, fallbacksFor } from "@/lib/ai/auto-select";
import { formatOpenRouterError } from "@/lib/ai/model-fallbacks";
import { buildFreeModeAttemptChain } from "@/lib/ai/openrouter-routing";
import { streamTextWithModelFallback } from "@/lib/ai/stream-with-fallback";
import { classifyTaskIntent } from "@/lib/ai/router";
import { buildFilesContextBlock, extractAll } from "@/lib/files/extract";
import { inlineLocalAttachments } from "@/lib/files/inline";
import { classify, type FileKind } from "@/lib/files/mime";
import { createDocx } from "@/lib/ai/tools/create-docx";
import { createPdf } from "@/lib/ai/tools/create-pdf";
import { createSpreadsheet } from "@/lib/ai/tools/create-spreadsheet";
import {
  makeEditImageTool,
  makeGenerateImageTool,
  makeGenerateVideoTool,
  makeGenerateVoiceTool,
  makeTranscribeAudioTool,
} from "@/lib/ai/tools/media-tools";
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
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID, getTextFromMessage } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

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
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
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

    const vercelGeo = geolocation(request);
    const clientIp = getClientIp(request);
    const ipGeo =
      vercelGeo.city && vercelGeo.country
        ? null
        : await lookupIpGeo(clientIp);

    const requestHints: RequestHints = {
      longitude:
        vercelGeo.longitude ?? ipGeo?.longitude?.toString() ?? undefined,
      latitude:
        vercelGeo.latitude ?? ipGeo?.latitude?.toString() ?? undefined,
      city: vercelGeo.city ?? ipGeo?.city ?? undefined,
      country: vercelGeo.country ?? ipGeo?.countryCode ?? undefined,
      timezone: ipGeo?.timezone ?? undefined,
    };

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

    // ── Multi-format attachment ingestion ───────────────────────────────
    const attachedFiles = (lastUserMessage?.parts ?? [])
      .filter(
        (p): p is { type: "file"; mediaType: string; name: string; url: string } =>
          (p as { type?: string }).type === "file"
      )
      .map((p) => ({ url: p.url, name: p.name, mime: p.mediaType }));

    const extractedFiles = attachedFiles.length
      ? await extractAll(attachedFiles)
      : [];
    const filesBlock = buildFilesContextBlock(extractedFiles);
    const attachmentKinds: FileKind[] = attachedFiles.map((a) =>
      classify(a.mime, a.name)
    );

    const userSettings = await getUserSettings(session.user.id);
    const openRouterApiKey = await resolveOpenRouterApiKeyForUser(
      session.user.id
    );

    if (!openRouterApiKey?.trim()) {
      return new ChatbotError(
        "bad_request:api",
        "OpenRouter API key belum dikonfigurasi. Isi di Pengaturan → API & integrasi, atau set OPENROUTER_API_KEY di .env.local lalu restart server."
      ).toResponse();
    }

    const memoryEnabled = userSettings.memory.enabled;
    const memoryAutoExtract = userSettings.memory.autoExtract;
    const preExtractOn =
      memoryEnabled &&
      memoryAutoExtract &&
      userSettings.memory.preExtractFromUser !== false;

    const mergeSimilar = userSettings.memory.mergeSimilarMemories !== false;

    const preExtractPromise = preExtractOn
      ? preExtractUserMemories({
          userId: session.user.id,
          userMessage: lastUserText,
          chatId: id,
          maxPerTurn: Math.min(userSettings.memory.maxExtractPerTurn, 2),
          openRouterApiKey,
          mergeSimilar,
        }).catch(() => null)
      : Promise.resolve();

    if (isExplicitRememberRequest(lastUserText)) {
      await preExtractPromise;
    }

    const memoryContext = await Promise.all([
      preExtractOn && !isExplicitRememberRequest(lastUserText)
        ? preExtractPromise
        : Promise.resolve(),
      buildMemoryContext({
        userId: session.user.id,
        query: lastUserText,
        chatId: id,
      }),
    ]).then(([, ctx]) => ctx);

    let webSearchDetection =
      !isToolApprovalFlow && lastUserText.trim()
        ? detectWebSearchNeed(lastUserText)
        : { needed: false as const, query: "" };

    if (!userSettings.advanced.webSearchAuto) {
      webSearchDetection = {
        ...webSearchDetection,
        needed: false,
        reason: "disabled_in_settings",
      };
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

    const activeTier = normalizeModelTier(initialChatModel);
    const integrationModels = resolveIntegrationModels(
      userSettings.integrations,
      activeTier
    );

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
      const freePick = resolveFreeModeModel(attachmentKinds, integrationModels, {
        userText: lastUserText,
        contextChars,
      });
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
        ].filter((id, i, arr) => id && id !== chatModel && arr.indexOf(id) === i);

    const documentModelId = freeModeActive
      ? chatModel
      : integrationModels.documentModel ||
        integrationModels.codingModel ||
        chatModel;

    const freeAttemptChain = freeAttemptChainEarly;

    // Replace `/storage/...` URLs (unreachable from external LLM providers)
    // with inline base64 data URLs so the model actually receives the bytes.
    const inlinedMessages = await inlineLocalAttachments(uiMessages);
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

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
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

        let webSearchContextBlock = "";
        let relatedPromise: Promise<string[]> | null = null;

        if (!isToolApprovalFlow && lastUserText.trim() && webSearchDetection.needed) {
          const detection = webSearchDetection;
          if (detection.needed) {
            dataStream.write({
              type: "data-search-status",
              data: { status: "searching", query: detection.query },
            });

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
              dataStream.write({ type: "text-delta", id: textId, delta: chunk });
            }
            dataStream.write({ type: "text-end", id: textId });

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

        const fullTools = [...VANDOR_CHAT_TOOLS];

        const activeTools =
          webSearchContextBlock.length > 0
            ? fullTools.filter((t) => t !== "webSearch")
            : [...fullTools];

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
              responseMode,
              persona: userSettings.persona,
            }) +
            (freeModeActive
              ? `\n\n=== TIER GRATIS ===\nVANDOR mencoba ${freeAttemptChain?.length ?? 15} model :free bergantian (Llama 3.3, GPT-OSS, Nemotron, Kimi, dll.) sampai ada respons.${
                  freeHeavyReason
                    ? ` Permintaan ini terdeteksi berat (${freeHeavyReason}). Kerjakan seadanya secara singkat, lalu SARANKAN tier Hemat atau Seimbang di picker model untuk hasil lebih stabil.`
                    : " Jawab ringkas dan to the point."
                }`
              : ""),
          messages: modelMessages,
          maxOutputTokens:
            webSearchContextBlock.length > 0
              ? WEB_SEARCH_SYNTHESIS_MAX_TOKENS
              : undefined,
          temperature: webSearchContextBlock.length > 0 ? 0.4 : undefined,
          stopWhen: stepCountIs(5),
          experimental_activeTools:
            isReasoningModel && !supportsTools ? [] : activeTools,
          tools: {
            getCurrentTime,
            getLocation: makeGetLocation(ipGeo),
            getWeather,
            showMap,
            webSearch,
            ...assistantTools,
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
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        if (attemptIndex > 0 || resolvedModelId !== synthesisModelId) {
          dataStream.write({
            type: "data-model-meta",
            data: {
              modelId: resolvedModelId,
              requestedModelId: requestedMode,
              chatMode: activeTier,
              modelTier: activeTier,
              agentId: orchestratorAgentId,
              agentName: orchestratorAgentName,
              overridden: true,
              fallbackUsed: true,
              attemptIndex,
              attemptTotal: attemptedModels.length,
              fallbackChain: attemptedModels,
              reason:
                freeModeActive && attemptIndex > 0
                  ? `Rotasi Gratis: model #${attemptIndex + 1} dari ${attemptedModels.length} (${resolvedModelId.split("/").pop()})`
                  : selectionReason,
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
        }

        dataStream.merge(
          stream.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

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
          const messagesToSave = finishedMessages.map((currentMessage) => {
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

          const assistantMsg = finishedMessages.find((m) => m.role === "assistant");
          if (assistantMsg && lastUserText) {
            const rawText = getTextFromMessage(assistantMsg);
            if (rawText.trim()) {
              if (
                userSettings.advanced.responsePolish &&
                process.env.VANDOR_DISABLE_POLISH !== "1"
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
            extractAndStoreMemories({
              userId: session.user.id,
              userMessage: lastUserText,
              assistantMessage: rawText,
              chatId: id,
              maxPerTurn: userSettings.memory.maxExtractPerTurn,
              openRouterApiKey,
              mergeSimilar,
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
