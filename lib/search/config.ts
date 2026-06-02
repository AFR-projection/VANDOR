export const WEB_SEARCH_MAX_RESULTS = 5;

export const WEB_SEARCH_SYNTHESIS_MAX_TOKENS = 4096;

export function getWebSearchSynthesisModel(
  fallbackModelId: string,
  userOverride?: string
): string {
  const fromUser = userOverride?.trim();
  if (fromUser) {
    return fromUser;
  }
  return process.env.VANDOR_WEB_SEARCH_MODEL?.trim() || fallbackModelId;
}
