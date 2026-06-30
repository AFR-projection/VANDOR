import "server-only";

import { type ModelMessage, stepCountIs, type UserContent } from "ai";
import { autoSelectModel, fallbacksFor } from "@/lib/ai/auto-select";
import { buildGratisRotationChain } from "@/lib/ai/free-models";
import { getOpenRouterContextForUser } from "@/lib/ai/integration-models";
import { getCapabilities } from "@/lib/ai/models";
import {
  formatOpenRouterUserError,
  openRouterErrorMessage,
} from "@/lib/ai/openrouter-routing";
import { buildOwnerAuthorityBlock } from "@/lib/ai/owner-authority-prompt";
import { systemPrompt } from "@/lib/ai/prompts";
import { resolveOpenRouterApiKeyForUser } from "@/lib/ai/providers";
import { streamTextWithModelFallback } from "@/lib/ai/stream-with-fallback";
import { buildOwnerConversationFreedomBlock } from "@/lib/ai/system-security-fence";
import { makeAgentWorkTool } from "@/lib/ai/tools/agent-work";
import { makeAssistantTools } from "@/lib/ai/tools/assistant-tools";
import { makeCheckSystemTool } from "@/lib/ai/tools/check-system";
import { createDocx } from "@/lib/ai/tools/create-docx";
import { createPdf } from "@/lib/ai/tools/create-pdf";
import { createSpreadsheet } from "@/lib/ai/tools/create-spreadsheet";
import { makeDownloadMediaTool } from "@/lib/ai/tools/download-media";
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
import { showMap } from "@/lib/ai/tools/show-map";
import { makeWebSearch } from "@/lib/ai/tools/web-search";
import { buildCachedAwarenessContextBlock } from "@/lib/autonomous/awareness";
import { buildRecentAlertsContextBlock } from "@/lib/autonomous/recent-alerts";
import {
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import {
  buildFilesContextBlock,
  type ExtractedFile,
} from "@/lib/files/extract";
import type { FileKind } from "@/lib/files/mime";
import { buildMemoryContext } from "@/lib/memory/build-context";
import {
  extractAndStoreMemories,
  preExtractUserMemories,
} from "@/lib/memory/extract";
import { VANDOR_UNIFIED_IDENTITY_BLOCK } from "@/lib/operator/identity-prompt";
import { generateUUID } from "@/lib/utils";
import { transcribeAudioBuffer } from "@/lib/voice/transcribe";
import { emitChatUpdated } from "./chat-push";
import { getWhatsappModelId } from "./config";
import { resolveDeploymentOwnerUser } from "./deployment-owner";
import {
  defaultPromptForMedia,
  type WhatsappInboundMedia,
} from "./inbound-media";
import type { WhatsappOutboundAttachment } from "./outbound-media";
import { attachmentsFromToolResults } from "./outbound-media";
import { buildWhatsappOwnerToneBlock } from "./wa-tone";

const MAX_HISTORY_MESSAGES = 12;
const MAX_AGENT_STEPS = 6;
const MAX_OUTPUT_TOKENS = 1200;
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

type RunAgentTurnInput = {
  userId: string;
  chatId: string;
  text: string;
  senderName?: string;
  media?: WhatsappInboundMedia[];
};

type RunAgentTurnResult = {
  reply: string;
  chatId: string;
  outbound: WhatsappOutboundAttachment[];
};

function partsToText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        Boolean(p) &&
        typeof p === "object" &&
        (p as { type?: string }).type === "text" &&
        typeof (p as { text?: unknown }).text === "string"
    )
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function buildExtractedFiles(media: WhatsappInboundMedia[]): ExtractedFile[] {
  return media.map((item) => ({
    url: item.url,
    name: item.filename,
    mime: item.mime,
    kind: item.kind,
    text: item.extractedText ?? "",
    truncated: false,
    bytes: item.buffer.byteLength,
    meta: item.caption ? { caption: item.caption } : undefined,
  }));
}

function buildMultimodalUserContent(
  userText: string,
  media: WhatsappInboundMedia[]
): UserContent {
  const parts: UserContent = [];
  const transcriptLines: string[] = [];

  for (const item of media) {
    if (
      item.kind === "image" &&
      item.buffer.byteLength <= MAX_INLINE_IMAGE_BYTES
    ) {
      parts.push({
        type: "image",
        image: `data:${item.mime};base64,${item.buffer.toString("base64")}`,
      });
      if (item.waType === "stickerMessage") {
        transcriptLines.push(
          "[User mengirim stiker WhatsApp — lihat gambar di atas]"
        );
      }
      continue;
    }

    if (item.kind === "audio" && item.extractedText?.trim()) {
      const label = item.isVoiceNote ? "Pesan suara" : "Audio";
      transcriptLines.push(`[${label}]: ${item.extractedText.trim()}`);
      continue;
    }

    if (item.kind === "audio" || item.kind === "video") {
      parts.push({
        type: "file",
        data: item.buffer,
        mediaType: item.mime,
        filename: item.filename,
      });
    }
  }

  let text = userText;
  if (transcriptLines.length > 0) {
    const joined = transcriptLines.join("\n");
    text = userText ? `${userText}\n\n${joined}` : joined;
  }

  parts.push({ type: "text", text });
  return parts;
}

async function transcribeInboundAudio(
  userId: string,
  media: WhatsappInboundMedia[]
): Promise<WhatsappInboundMedia[]> {
  const out: WhatsappInboundMedia[] = [];
  for (const item of media) {
    if (item.kind !== "audio") {
      out.push(item);
      continue;
    }
    const result = await transcribeAudioBuffer({
      userId,
      buffer: item.buffer,
      contentType: item.mime,
    });
    out.push({
      ...item,
      extractedText: result.ok
        ? result.text
        : `[Transkripsi gagal: ${result.error}]`,
    });
  }
  return out;
}

/**
 * Run one non-streaming agent turn for a WhatsApp message and persist both the
 * user and assistant messages to the same chat used by the web UI.
 */
export async function runWhatsappAgentTurn({
  userId,
  chatId,
  text,
  senderName,
  media = [],
}: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const trimmed = text.trim();
  const hasMedia = media.length > 0;

  if (!trimmed && !hasMedia) {
    return {
      reply: "Pesan kosong — coba kirim teks atau media ya.",
      chatId,
      outbound: [],
    };
  }

  const userText = trimmed || (hasMedia ? defaultPromptForMedia(media) : "");

  const processedMedia = hasMedia
    ? await transcribeInboundAudio(userId, media)
    : media;

  const apiKey =
    (await resolveOpenRouterApiKeyForUser(userId)) ??
    process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new ChatbotError(
      "bad_request:api",
      "API key OpenRouter belum diset. Isi di Pengaturan → API & integrasi, atau set OPENROUTER_API_KEY di .env.local lalu restart server."
    );
  }

  const existingChat = await getChatById({ id: chatId });
  if (!existingChat) {
    await saveChat({
      id: chatId,
      userId,
      title: senderName ? `WhatsApp · ${senderName}` : "WhatsApp",
      visibility: "private",
    });
  }

  const history = existingChat ? await getMessagesByChatId({ id: chatId }) : [];

  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const modelMessages: ModelMessage[] = recentHistory
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: partsToText(m.parts),
    }))
    .filter((m) => typeof m.content === "string" && m.content.length > 0);

  if (hasMedia) {
    modelMessages.push({
      role: "user",
      content: buildMultimodalUserContent(userText, processedMedia),
    });
  } else {
    modelMessages.push({ role: "user", content: userText });
  }

  const isFreeMid = (id: string) =>
    id.endsWith(":free") || id === "openrouter/free";

  const envOverride = process.env.WHATSAPP_MODEL?.trim();
  let modelId = envOverride || (await getWhatsappModelId());
  let attemptModelIds: string[] | undefined;
  let freeMode = isFreeMid(modelId);
  let extraFallbacks: string[] | undefined;

  const openRouterCtx = await getOpenRouterContextForUser(userId).catch(
    () => null
  );

  if (freeMode) {
    attemptModelIds = buildGratisRotationChain(
      openRouterCtx
        ? {
            freeModel1: openRouterCtx.models.freeModel1,
            freeModel2: openRouterCtx.models.freeModel2,
            freeModel3: openRouterCtx.models.freeModel3,
          }
        : undefined
    );
    modelId = attemptModelIds[0] ?? modelId;
  } else if (openRouterCtx) {
    extraFallbacks = [
      openRouterCtx.models.chatModel,
      openRouterCtx.models.reasoningModel,
    ].filter(
      (id, index, arr) =>
        id &&
        !id.endsWith(":free") &&
        id !== modelId &&
        arr.indexOf(id) === index
    );
  }

  const extractedFiles = buildExtractedFiles(processedMedia);
  const filesBlock = buildFilesContextBlock(extractedFiles);
  const attachmentKinds: FileKind[] = processedMedia.map((m) => m.kind);
  const contextChars = filesBlock.length + userText.length;

  if (hasMedia) {
    const visionModelId =
      openRouterCtx?.models.visionModel ?? "moonshotai/kimi-k2.6:free";
    const selection = await autoSelectModel({
      selectedModelId: modelId,
      attachmentKinds,
      contextChars,
      visionModelId,
    });
    if (selection.overridden) {
      modelId = selection.modelId;
      freeMode = isFreeMid(modelId);
      extraFallbacks = fallbacksFor[modelId];
      if (freeMode) {
        attemptModelIds = [
          modelId,
          ...(extraFallbacks ?? []),
          ...(attemptModelIds ?? []),
        ].filter((id, index, arr) => id && arr.indexOf(id) === index);
      }
    }
  }

  console.log(
    `[wa] using model ${modelId} for agent turn (freeMode=${freeMode}, media=${media.length})`
  );

  const capabilities = await getCapabilities();
  const cap = capabilities[modelId];
  const supportsTools =
    cap?.tools === true ||
    (!freeMode &&
      !modelId.endsWith(":free") &&
      modelId !== "openrouter/free" &&
      cap?.tools !== false);

  const memoryQuery = [
    userText,
    ...processedMedia
      .filter((m) => m.kind === "audio" && m.extractedText?.trim())
      .map((m) => m.extractedText?.trim() ?? ""),
  ]
    .filter(Boolean)
    .join("\n");

  const memoryContext = await buildMemoryContext({
    userId,
    query: memoryQuery || userText,
    chatId,
  }).catch(() => "");

  const imageUrls = processedMedia
    .filter((m) => m.kind === "image")
    .map((m) => m.url);

  const activeTools = supportsTools
    ? ([
        "webSearch",
        "getWeather",
        "getCurrentTime",
        "showMap",
        "getLocation",
        "downloadMedia",
        "generateImage",
        "editImage",
        "createPdf",
        "createDocx",
        "createSpreadsheet",
        "generateVideo",
        "generateVoice",
        "transcribeAudio",
        "createWhatsappSticker",
        "saveMemory",
        "getMemory",
        "searchDb",
        "updateTask",
        "checkSystem",
        "agentWork",
      ] as const)
    : undefined;

  const deploymentOwner = await resolveDeploymentOwnerUser();
  const ownerAuthorityBlock = buildOwnerAuthorityBlock({
    isDeploymentOwner: deploymentOwner?.id === userId,
    ownerEmail: deploymentOwner?.email,
    whatsappOwner: true,
  });
  const ownerFreedomBlock = buildOwnerConversationFreedomBlock({
    isDeploymentOwner: deploymentOwner?.id === userId,
    whatsappOwner: false,
  });

  let operatorContextBlock = "";
  let recentAlertsBlock = "";
  try {
    [operatorContextBlock, recentAlertsBlock] = await Promise.all([
      buildCachedAwarenessContextBlock(),
      buildRecentAlertsContextBlock(4),
    ]);
  } catch {
    operatorContextBlock = "";
    recentAlertsBlock = "";
  }

  const system = systemPrompt({
    requestHints: {
      latitude: undefined,
      longitude: undefined,
      city: undefined,
      country: undefined,
      timezone: "Asia/Jakarta",
    },
    supportsTools,
    memoryContext,
    responseMode: "enhanced",
    activeTools: activeTools ? [...activeTools] : undefined,
    ownerAuthorityBlock,
    ownerFreedomBlock:
      deploymentOwner?.id === userId ? ownerFreedomBlock : null,
  });

  const assistantTools = makeAssistantTools(userId, chatId);

  const tools = supportsTools
    ? {
        getCurrentTime,
        getWeather,
        webSearch: makeWebSearch(userId),
        showMap,
        getLocation: makeGetLocation(null),
        downloadMedia: makeDownloadMediaTool(),
        generateImage: makeGenerateImageTool(userId),
        editImage: makeEditImageTool(userId, imageUrls),
        createPdf,
        createDocx,
        createSpreadsheet,
        generateVideo: makeGenerateVideoTool(userId),
        generateVoice: makeGenerateVoiceTool(userId),
        transcribeAudio: makeTranscribeAudioTool(userId),
        createWhatsappSticker: makeCreateWhatsappStickerTool(userId),
        saveMemory: assistantTools.saveMemory,
        getMemory: assistantTools.getMemory,
        searchDb: assistantTools.searchDb,
        updateTask: assistantTools.updateTask,
        checkSystem: makeCheckSystemTool(),
        agentWork: makeAgentWorkTool({ userId, chatId }),
      }
    : undefined;

  preExtractUserMemories({
    userId,
    userMessage: userText,
    chatId,
    openRouterApiKey: apiKey,
    modelId,
  }).catch(() => null);

  const waChannelBlock = [
    "=== KANAL WHATSAPP ===",
    "User sedang chat lewat WhatsApp (owner VANDOR).",
    buildWhatsappOwnerToneBlock(),
    VANDOR_UNIFIED_IDENTITY_BLOCK,
    recentAlertsBlock || null,
    operatorContextBlock ? `\n${operatorContextBlock}` : null,
    "Jawab ringkas dan jelas (1–8 kalimat), tanpa markdown berat, tanpa heading, tanpa tabel.",
    "Balas singkat (1–8 kalimat). Jika user *reply* ke pesan/alert sebelumnya, konteks quote sudah ada di teks user — jelaskan alert itu, jangan pura-pura tidak tahu.",
    "Untuk showMap, sertakan link OSM di jawaban.",
    "Kalau perlu data live, panggil webSearch.",
    supportsTools
      ? "MEMORI: pakai searchDb sebelum bilang lupa; saveMemory untuk ingat/jangan lupa; getMemory untuk lihat memori; updateTask untuk todo."
      : null,
    hasMedia
      ? "User mengirim media (gambar/dokumen/suara/stiker/video). Analisis isinya — jangan bilang kamu tidak menerima file."
      : null,
    processedMedia.some((m) => m.waType === "stickerMessage")
      ? "User mengirim STIKER — deskripsikan & reaksikan natural (boleh santai/lucu)."
      : null,
    processedMedia.some((m) => m.isVoiceNote)
      ? "Pesan suara sudah ditranskrip ke teks — balas isinya, jangan minta user mengetik ulang."
      : null,
    supportsTools
      ? "TOOLS AKTIF: checkSystem, agentWork (worker nyata), gambar, stiker WA, edit foto, PDF/DOCX/spreadsheet, video, suara, transkripsi, cuaca, peta, unduh media, memori, todo."
      : "Model tanpa tools — jawab dari pengetahuan & memori konteks saja.",
  ]
    .filter(Boolean)
    .join("\n");

  let replyText = "";
  let outbound: WhatsappOutboundAttachment[] = [];

  try {
    const { stream } = await streamTextWithModelFallback({
      primaryModelId: modelId,
      apiKey,
      freeMode,
      attemptModelIds,
      extraFallbacks,
      system: `${system}${filesBlock}\n\n${waChannelBlock}`.trim(),
      messages: modelMessages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      ...(tools ? { tools } : {}),
    });

    replyText = (await stream.text).trim();

    const steps = await stream.steps;
    const toolResults = steps.flatMap((step) =>
      (step.toolResults ?? []).map((tr) => ({
        toolName: tr.toolName,
        output: tr.output,
      }))
    );
    outbound = await attachmentsFromToolResults(toolResults);
  } catch (error) {
    const msg = openRouterErrorMessage(error);
    throw new ChatbotError(
      "bad_request:api",
      formatOpenRouterUserError(msg, modelId)
    );
  }

  if (!replyText && outbound.length === 0) {
    replyText = "Maaf, aku belum bisa menjawab itu. Coba ulangi ya.";
  }

  const now = new Date();
  const audioLines = processedMedia
    .filter((m) => m.kind === "audio" && m.extractedText?.trim())
    .map((m) => `[Pesan suara]: ${m.extractedText?.trim() ?? ""}`);
  const persistedUserText =
    audioLines.length > 0
      ? [userText, ...audioLines].filter(Boolean).join("\n\n")
      : userText;

  const userParts: Array<
    | { type: "text"; text: string }
    | { type: "file"; url: string; mediaType: string; name: string }
  > = processedMedia.map((m) => ({
    type: "file" as const,
    url: m.url,
    mediaType: m.mime,
    name: m.filename,
  }));
  userParts.push({ type: "text", text: persistedUserText });

  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: "user",
        parts: userParts,
        attachments: [],
        createdAt: now,
      },
      {
        id: generateUUID(),
        chatId,
        role: "assistant",
        parts: [{ type: "text", text: replyText || "(media dikirim)" }],
        attachments: [],
        createdAt: new Date(now.getTime() + 1),
      },
    ],
  });

  emitChatUpdated(chatId);

  extractAndStoreMemories({
    userId,
    userMessage: userText,
    assistantMessage: replyText,
    chatId,
    openRouterApiKey: apiKey,
    modelId,
  }).catch(() => null);

  return { reply: replyText, chatId, outbound };
}
