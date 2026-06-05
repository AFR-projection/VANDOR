import { WEB_SEARCH_SYNTHESIS_MAX_TOKENS } from "@/lib/search/config";
import type { ResponseMode } from "@/lib/search/detect";
import type { VandorIntent } from "@/lib/v4/intent";

export function shouldRunPreExtract(input: {
  enabled: boolean;
  intent: VandorIntent;
  userText: string;
  isRemember: boolean;
}): boolean {
  if (!input.enabled) {
    return false;
  }
  // Explicit "ingat" / memory intent: always capture before reply (cheap, parallel).
  if (input.isRemember || input.intent === "memory") {
    return true;
  }
  if (input.intent === "chat_simple" || input.intent === "command") {
    return false;
  }
  if (input.userText.length < 24) {
    return false;
  }
  return true;
}

export function shouldPolishResponse(input: {
  enabled: boolean;
  intent: VandorIntent;
  responseMode: ResponseMode;
  webSearchPreloaded: boolean;
}): boolean {
  if (!input.enabled || process.env.VANDOR_DISABLE_POLISH === "1") {
    return false;
  }
  if (input.webSearchPreloaded || input.responseMode === "simple") {
    return false;
  }
  if (
    input.intent === "chat_simple" ||
    input.intent === "task" ||
    input.intent === "notes" ||
    input.intent === "memory" ||
    input.intent === "weather" ||
    input.intent === "time"
  ) {
    return false;
  }
  return input.intent === "chat_reasoning" || input.intent === "code";
}

export function maxOutputTokensForTurn(input: {
  responseMode: ResponseMode;
  webSearchPreloaded: boolean;
}): number | undefined {
  if (input.webSearchPreloaded) {
    return WEB_SEARCH_SYNTHESIS_MAX_TOKENS;
  }
  if (input.responseMode === "simple") {
    return 512;
  }
  if (input.responseMode === "enhanced") {
    return 2048;
  }
  return 3072;
}
