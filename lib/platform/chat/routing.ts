import type { FileKind } from "@/lib/files/mime";
import type { VandorIntent } from "@/lib/v4/intent";
import { isPlatformChatWorkflowEnabled } from "../config";

export { isPlatformChatWorkflowEnabled };

const FAST_PATH_INTENTS = new Set<VandorIntent>([
  "command",
  "vault",
  "memory",
  "time",
  "weather",
  "task",
  "chat_simple",
]);

const WORKFLOW_INTENTS = new Set<VandorIntent>([
  "code",
  "operator",
  "document",
  "pdf",
  "image",
  "chat_reasoning",
  "media",
]);

export function shouldRouteToPlatformWorkflow(input: {
  intent: VandorIntent;
  userText: string;
  attachmentKinds: FileKind[];
  bypassLlm: boolean;
}): boolean {
  if (!isPlatformChatWorkflowEnabled()) {
    return false;
  }

  if (input.bypassLlm) {
    return false;
  }

  if (FAST_PATH_INTENTS.has(input.intent)) {
    return false;
  }

  if (WORKFLOW_INTENTS.has(input.intent)) {
    return true;
  }

  if (input.intent === "search" || input.intent === "map") {
    return input.userText.length > 280;
  }

  if (input.attachmentKinds.length > 0 && input.intent !== "image") {
    return true;
  }

  return (
    input.userText.length > 400 ||
    /\b(buatkan|build|deploy|scan|fix|refactor|analisis|bandingkan)\b/i.test(
      input.userText
    )
  );
}
