import type { ChatMessage } from "@/lib/types";

/** Assistant bubble worth showing (not metadata-only shell). */
export function assistantHasVisibleContent(message: ChatMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === "text" && part.text?.trim()) {
      return true;
    }
    if (
      part.type === "reasoning" &&
      "text" in part &&
      part.text?.trim()
    ) {
      return true;
    }
    if (part.type.startsWith("tool-")) {
      return true;
    }
    if (
      part.type === "data-web-sources" ||
      part.type === "data-rich-content" ||
      part.type === "data-media-download-progress"
    ) {
      return true;
    }
    return false;
  });
}

export function shouldPersistChatMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") {
    return true;
  }
  return assistantHasVisibleContent(message);
}
