import type { ChatMessage } from "@/lib/types";

function isValidPart(
  part: ChatMessage["parts"][number] | null | undefined
): part is ChatMessage["parts"][number] {
  return (
    part != null &&
    typeof part === "object" &&
    "type" in part &&
    typeof part.type === "string"
  );
}

/** Assistant bubble worth showing (not metadata-only shell). */
export function assistantHasVisibleContent(message: ChatMessage): boolean {
  return message.parts.filter(isValidPart).some((part) => {
    if (part.type === "text" && part.text?.trim()) {
      return true;
    }
    if (part.type === "reasoning" && "text" in part && part.text?.trim()) {
      return true;
    }
    if (part.type.startsWith("tool-")) {
      return true;
    }
    if (
      part.type === "data-web-sources" ||
      part.type === "data-rich-content" ||
      part.type === "data-media-download-progress" ||
      part.type === "data-vault-list" ||
      part.type === "data-vault-open" ||
      part.type === "data-vault-detail" ||
      part.type === "data-vault-upload" ||
      part.type === "data-vault-mode-enter" ||
      part.type === "data-vault-mode-exit" ||
      part.type === "data-vault-denied" ||
      part.type === "data-vault-read" ||
      part.type === "data-vault-help" ||
      part.type === "data-share-to-ai"
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
