"use client";

import { toSafeThinkingTrace } from "@/lib/agent-activity/thinking-trace";
import { Reasoning, ReasoningTrigger } from "../ai-elements/reasoning";

type MessageReasoningProps = {
  isLoading: boolean;
  reasoning: string;
};

export function MessageReasoning({
  isLoading,
  reasoning,
}: MessageReasoningProps) {
  const traces = toSafeThinkingTrace(reasoning);

  if (isLoading || traces.length === 0) {
    return null;
  }

  return (
    <Reasoning
      data-testid="message-reasoning"
      defaultOpen={false}
      isStreaming={false}
    >
      <ReasoningTrigger
        getThinkingMessage={() => (
          <p className="text-[13px]">Proses analisis selesai</p>
        )}
      />
      <ul className="mt-2 space-y-1 rounded-lg border border-border/20 bg-muted/30 px-3 py-2">
        {traces.map((trace) => (
          <li
            className="flex items-start gap-2 text-[11px] text-muted-foreground"
            key={trace}
          >
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/50" />
            {trace}
          </li>
        ))}
      </ul>
    </Reasoning>
  );
}
