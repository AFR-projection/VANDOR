import { V4_MAX_CHAT_MESSAGES, V4_MAX_MEMORY_CONTEXT_CHARS } from "@/lib/v4/constants";

export type TurnUsageEstimate = {
  /** Rough input tokens sent to the model this turn */
  inputTokensEst: number;
  memoryTokensEst: number;
  webTokensEst: number;
  filesTokensEst: number;
  historyTokensEst: number;
  maxOutputTokens: number;
  messageCount: number;
  intent?: string;
};

/** ~4 chars per token for Latin/Indonesian mixed text */
export function charsToTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}

export function estimateTurnUsage(input: {
  memoryContextChars: number;
  filesContextChars: number;
  webContextChars: number;
  userTextChars: number;
  messageCount: number;
  maxOutputTokens: number;
  intent?: string;
}): TurnUsageEstimate {
  const cappedHistory = Math.min(input.messageCount, V4_MAX_CHAT_MESSAGES);
  const historyChars = cappedHistory * 420;
  const memoryChars = Math.min(
    input.memoryContextChars,
    V4_MAX_MEMORY_CONTEXT_CHARS
  );

  const memoryTokensEst = charsToTokens(memoryChars);
  const webTokensEst = charsToTokens(input.webContextChars);
  const filesTokensEst = charsToTokens(input.filesContextChars);
  const historyTokensEst = charsToTokens(historyChars);
  const userTokensEst = charsToTokens(input.userTextChars);

  const inputTokensEst =
    memoryTokensEst +
    webTokensEst +
    filesTokensEst +
    historyTokensEst +
    userTokensEst +
    800;

  return {
    inputTokensEst,
    memoryTokensEst,
    webTokensEst,
    filesTokensEst,
    historyTokensEst,
    maxOutputTokens: input.maxOutputTokens,
    messageCount: input.messageCount,
    intent: input.intent,
  };
}
