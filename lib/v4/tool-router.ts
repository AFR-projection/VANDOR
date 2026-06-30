import "server-only";

import type { VandorChatToolName } from "@/lib/ai/tools/registry";
import { detectFootballNeed } from "@/lib/football/detect";
import { detectWebSearchNeed } from "@/lib/search/detect";
import { V4_MAX_ACTIVE_TOOLS } from "@/lib/v4/constants";
import type { VandorIntent } from "@/lib/v4/intent";

const CORE: VandorChatToolName[] = ["getCurrentTime", "getLocation"];

const BY_INTENT: Record<VandorIntent, VandorChatToolName[]> = {
  command: [],
  task: ["updateTask", "getCurrentTime"],
  vault: [],
  memory: ["saveMemory", "getMemory", "searchDb"],
  weather: ["getLocation", "getWeather", "getCurrentTime"],
  time: ["getCurrentTime", "getLocation"],
  search: ["webSearch", "footballApi"],
  map: ["showMap", "getLocation"],
  media: ["downloadMedia"],
  document: [
    "createDocument",
    "editDocument",
    "updateDocument",
    "requestSuggestions",
  ],
  code: ["createDocument", "editDocument", "updateDocument"],
  image: ["generateImage", "editImage"],
  pdf: ["createPdf", "createDocx", "createSpreadsheet"],
  chat_simple: ["getCurrentTime", "searchDb"],
  chat_reasoning: ["searchDb", "getMemory"],
  operator: ["checkSystem", "agentWork", "getCurrentTime"],
};

export function selectActiveTools(input: {
  intent: VandorIntent;
  hasAttachments: boolean;
  webSearchPreloaded: boolean;
  webSearchDisabled: boolean;
  footballPreloaded?: boolean;
  supportsTools: boolean;
  /** Pesan user saat ini — untuk link follow-up saat intent belum `search`. */
  userText?: string;
}): VandorChatToolName[] {
  if (!input.supportsTools) {
    return [];
  }

  const set = new Set<VandorChatToolName>();

  if (input.intent === "command") {
    return [];
  }

  for (const t of BY_INTENT[input.intent] ?? []) {
    set.add(t);
  }

  if (input.hasAttachments) {
    set.add("createPdf");
    set.add("createDocx");
    set.add("editImage");
  }

  if (input.footballPreloaded) {
    set.delete("footballApi");
  } else if (
    input.userText?.trim() &&
    detectFootballNeed(input.userText).needed
  ) {
    set.add("footballApi");
  }

  if (input.webSearchPreloaded) {
    set.delete("webSearch");
  } else if (
    !input.webSearchDisabled &&
    (input.intent === "search" ||
      (input.userText?.trim() && detectWebSearchNeed(input.userText).needed))
  ) {
    set.add("webSearch");
  }

  if (set.size === 0) {
    for (const t of CORE) {
      set.add(t);
    }
    set.add("searchDb");
  }

  const list = [...set].slice(0, V4_MAX_ACTIVE_TOOLS);
  return list;
}
