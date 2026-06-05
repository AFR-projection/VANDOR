import type { ChatMessage } from "@/lib/types";

export type ParsedToolRun = {
  toolName: string;
  status: "ok" | "error";
  detail?: string;
};

export function parseToolRunsFromMessage(
  message: ChatMessage
): ParsedToolRun[] {
  const runs: ParsedToolRun[] = [];
  for (const part of message.parts ?? []) {
    const type = String(part.type ?? "");
    if (!type.startsWith("tool-")) {
      continue;
    }
    const toolName = type.replace(/^tool-/, "");
    const state = String((part as { state?: string }).state ?? "");
    if (state === "output-available") {
      const output = (part as { output?: Record<string, unknown> }).output;
      const err =
        output && typeof output === "object" && "error" in output
          ? String(output.error).slice(0, 200)
          : undefined;
      const okFlag =
        output && typeof output === "object" && "ok" in output
          ? Boolean(output.ok)
          : !err;
      runs.push({
        toolName,
        status: okFlag ? "ok" : "error",
        detail: err,
      });
    } else if (state === "output-error") {
      runs.push({
        toolName,
        status: "error",
        detail: String(
          (part as { errorText?: string }).errorText ?? "tool error"
        ).slice(0, 200),
      });
    }
  }
  return runs;
}
