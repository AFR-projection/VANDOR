import "server-only";

import { stepCountIs, type ModelMessage, type UserContent } from "ai";
import { autoSelectModel, fallbacksFor } from "@/lib/ai/auto-select";
import { getCapabilities } from "@/lib/ai/models";
import { buildGratisRotationChain } from "@/lib/ai/free-models";
import { getOpenRouterContextForUser } from "@/lib/ai/integration-models";
import {
  formatOpenRouterUserError,
  openRouterErrorMessage,
} from "@/lib/ai/openrouter-routing";
import { resolveOpenRouterApiKeyForUser } from "@/lib/ai/providers";
import { systemPrompt } from "@/lib/ai/prompts";
import { streamTextWithModelFallback } from "@/lib/ai/stream-with-fallback";
import { makeAssistantTools } from "@/lib/ai/tools/assistant-tools";
import { createDocx } from "@/lib/ai/tools/create-docx";
import { createPdf } from "@/lib/ai/tools/create-pdf";
import { createSpreadsheet } from "@/lib/ai/tools/create-spreadsheet";
import { makeDownloadMediaTool } from "@/lib/ai/tools/download-media";
import { getCurrentTime } from "@/lib/ai/tools/get-current-time";
import { makeGetLocation } from "@/lib/ai/tools/get-location";
import { getWeather } from "@/lib/ai/tools/get-weather";
import {
  makeEditImageTool,
  makeGenerateImageTool,
  makeGenerateVideoTool,
  makeGenerateVoiceTool,
  makeTranscribeAudioTool,
} from "@/lib/ai/tools/media-tools";
import { showMap } from "@/lib/ai/tools/show-map";
import { makeWebSearch } from "@/lib/ai/tools/web-search";
import {
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { buildFilesContextBlock, type ExtractedFile } from "@/lib/files/extract";
import type { FileKind } from "@/lib/files/mime";
import { buildMemoryContext } from "@/lib/memory/build-context";
import {
  extractAndStoreMemories,
  preExtractUserMemories,
} from "@/lib/memory/extract";
import { generateUUID } from "@/lib/utils";
import { emitChatUpdated } from "./chat-push";
import { getWhatsappModelId } from "./config";
import {
  defaultPromptForMedia,
  type WhatsappInboundMedia,
} from "./inbound-media";
import { attachmentsFromToolResults } from "./outbound-media";
import type { WhatsappOutboundAttachment } from "./outbound-media";

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

  for (const item of media) {
    if (item.kind === "image" && item.buffer.byteLength <= MAX_INLINE_IMAGE_BYTES) {
      parts.push({
        type: "image",
        image: `data:${item.mime};base64,${item.buffer.toString("base64")}`,
      });
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

  parts.push({ type: "text", text: userText });
  return parts;
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

  const userText =
    trimmed || (hasMedia ? defaultPromptForMedia(media) : "");

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

  const history = existingChat
    ? await getMessagesByChatId({ id: chatId })
    : [];

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
      content: buildMultimodalUserContent(userText, media),
    });
  } else {
    modelMessages.push({ role: "user", content: userText });
  }

  const isFreeMid = (id: string) =>
    id.endsWith(":free") || id === "openrouter/free";

  const envOverride = process.env.WHATSAPP_MODEL?.trim();
  let modelId = envOverride || getWhatsappModelId();
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
  }

  const extractedFiles = buildExtractedFiles(media);
  const filesBlock = buildFilesContextBlock(extractedFiles);
  const attachmentKinds: FileKind[] = media.map((m) => m.kind);
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
  const supportsTools = capabilities[modelId]?.tools !== false;

  const memoryContext = await buildMemoryContext({
    userId,
    query: userText,
    chatId,
  }).catch(() => "");

  const imageUrls = media
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
      ] as const)
    : undefined;

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
        saveMemory: assistantTools.saveMemory,
        getMemory: assistantTools.getMemory,
        searchDb: assistantTools.searchDb,
        updateTask: assistantTools.updateTask,
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
    "User sedang chat lewat WhatsApp.",
    "Jawab ringkas dan jelas (1–8 kalimat), tanpa markdown berat, tanpa heading, tanpa tabel.",
    "Untuk showMap, sertakan link OSM di jawaban.",
    "Kalau perlu data live, panggil webSearch.",
    hasMedia
      ? "User mengirim media (gambar/dokumen/suara/video). Analisis isinya — jangan bilang kamu tidak menerima file."
      : null,
    supportsTools
      ? "Kamu bisa generate gambar (generateImage), edit foto (editImage), PDF/DOCX/spreadsheet, video, suara, dan transkripsi audio. Hasil file akan otomatis dikirim ke WhatsApp user."
      : null,
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
  const userParts: Array<
    | { type: "text"; text: string }
    | { type: "file"; url: string; mediaType: string; name: string }
  > = media.map((m) => ({
    type: "file" as const,
    url: m.url,
    mediaType: m.mime,
    name: m.filename,
  }));
  userParts.push({ type: "text", text: userText });

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
