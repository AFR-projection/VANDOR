import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { makeAssistantTools } from "./ai/tools/assistant-tools";
import type { createDocument } from "./ai/tools/create-document";
import type { createDocx } from "./ai/tools/create-docx";
import type { createPdf } from "./ai/tools/create-pdf";
import type { createSpreadsheet } from "./ai/tools/create-spreadsheet";
import type { makeDownloadMediaTool } from "./ai/tools/download-media";
import type { getCurrentTime } from "./ai/tools/get-current-time";
import type { makeGetLocation } from "./ai/tools/get-location";
import type { getWeather } from "./ai/tools/get-weather";
import type {
  makeEditImageTool,
  makeGenerateImageTool,
} from "./ai/tools/media-tools";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { showMap } from "./ai/tools/show-map";
import type { updateDocument } from "./ai/tools/update-document";
import type { webSearch } from "./ai/tools/web-search";
import type { Suggestion } from "./db/schema";
import type { MediaDownloadProgressData } from "./media/types";
import type { MemorySavedNotice } from "./memory/notice";
import type { RichContent, WebSearchOutput } from "./search/types";
import type { TurnUsageEstimate } from "./v4/turn-usage";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type getCurrentTimeTool = InferUITool<typeof getCurrentTime>;
type getLocationTool = InferUITool<ReturnType<typeof makeGetLocation>>;
type webSearchTool = InferUITool<typeof webSearch>;
type downloadMediaTool = InferUITool<ReturnType<typeof makeDownloadMediaTool>>;
type showMapTool = InferUITool<typeof showMap>;
type createPdfTool = InferUITool<typeof createPdf>;
type createDocxTool = InferUITool<typeof createDocx>;
type createSpreadsheetTool = InferUITool<typeof createSpreadsheet>;
type generateImageTool = InferUITool<ReturnType<typeof makeGenerateImageTool>>;
type editImageTool = InferUITool<ReturnType<typeof makeEditImageTool>>;
type AssistantTools = ReturnType<typeof makeAssistantTools>;
type saveMemoryTool = InferUITool<AssistantTools["saveMemory"]>;
type getMemoryTool = InferUITool<AssistantTools["getMemory"]>;
type searchDbTool = InferUITool<AssistantTools["searchDb"]>;
type manageNotesTool = InferUITool<AssistantTools["manageNotes"]>;
type updateTaskTool = InferUITool<AssistantTools["updateTask"]>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  getCurrentTime: getCurrentTimeTool;
  getLocation: getLocationTool;
  webSearch: webSearchTool;
  downloadMedia: downloadMediaTool;
  showMap: showMapTool;
  createPdf: createPdfTool;
  createDocx: createDocxTool;
  createSpreadsheet: createSpreadsheetTool;
  generateImage: generateImageTool;
  editImage: editImageTool;
  saveMemory: saveMemoryTool;
  getMemory: getMemoryTool;
  searchDb: searchDbTool;
  manageNotes: manageNotesTool;
  updateTask: updateTaskTool;
};

export type ModelMeta = {
  modelId: string;
  requestedModelId: string;
  chatMode?: "gratis" | "hemat" | "seimbang" | "premium";
  modelTier?: "gratis" | "hemat" | "seimbang" | "premium";
  agentId?: string | null;
  agentName?: string | null;
  overridden: boolean;
  reason: string | null;
  /** True when startup fallback picked a different model than primary. */
  fallbackUsed?: boolean;
  attemptIndex?: number;
  attemptTotal?: number;
  fallbackChain?: string[];
  attachments?: Array<{
    name: string;
    kind: string;
    bytes: number;
    extracted: boolean;
    truncated: boolean;
    error?: string;
  }>;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
  "model-meta": ModelMeta;
  "search-status": {
    status: "searching" | "complete" | "idle";
    query?: string;
  };
  "media-download-progress": MediaDownloadProgressData;
  "instant-status": {
    label: string;
    phase: "start" | "done";
  };
  "web-sources": WebSearchOutput;
  "rich-content": RichContent;
  "memory-saved": MemorySavedNotice;
  "memory-recall": {
    active: boolean;
    charCount: number;
  };
  "turn-usage": TurnUsageEstimate;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
