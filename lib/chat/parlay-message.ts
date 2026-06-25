import type { ChatMessage } from "@/lib/types";

type ParlayToolOutput = {
  ok?: boolean;
  data?: { memberMessage?: string };
};

function isParlayCsToolPart(part: ChatMessage["parts"][number]): boolean {
  return (part.type as string) === "tool-skill_cs_mix_parlay";
}

export function messageHasParlayCsCard(message: ChatMessage): boolean {
  return message.parts.some((part) => {
    if (!isParlayCsToolPart(part)) {
      return false;
    }
    if (!("state" in part) || part.state !== "output-available") {
      return false;
    }
    const output = (part as { output?: ParlayToolOutput }).output;
    return Boolean(output?.ok && output.data?.memberMessage);
  });
}

/** Sembunyikan teks assistant duplikat — kartu salin sudah menampilkan balasan CS. */
export function shouldSuppressAssistantTextForParlay(
  message: ChatMessage,
  partType: string
): boolean {
  return (
    message.role === "assistant" &&
    partType === "text" &&
    messageHasParlayCsCard(message)
  );
}
