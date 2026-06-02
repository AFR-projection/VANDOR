"use client";

import { MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type { WebSearchSource } from "@/lib/search/types";
import { mergeWebSources, parseStructuredWebResponse } from "@/lib/search/parse-response";
import { cn, sanitizeText } from "@/lib/utils";
import { SourceCards } from "./rich/source-card";

export function AssistantAnswer({
  text,
  sources = [],
  className,
}: {
  text: string;
  sources?: WebSearchSource[];
  className?: string;
}) {
  const sanitized = sanitizeText(text);
  const structured = parseStructuredWebResponse(sanitized);

  const answerText = structured.hasStructure
    ? structured.answer || sanitized
    : sanitized;

  const allSources = mergeWebSources(sources, structured.parsedSources);

  return (
    <MessageContent
      className={cn(
        "w-full min-w-0 text-[15px] leading-[1.7] text-foreground/95 sm:text-[15px] sm:leading-[1.75]",
        className
      )}
      data-testid="message-content"
    >
      {answerText && (
        <section className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2.5 prose-headings:mb-2 prose-headings:mt-4 prose-li:my-0.5 sm:prose-p:my-3">
          <MessageResponse>{answerText}</MessageResponse>
        </section>
      )}

      {allSources.length > 0 && <SourceCards sources={allSources} />}

      {structured.notes && (
        <section className="mt-4 rounded-xl border border-border/40 bg-muted/20 px-3 py-3 sm:px-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Catatan
          </p>
          <div className="text-sm leading-relaxed text-foreground/85">
            <MessageResponse>{structured.notes}</MessageResponse>
          </div>
        </section>
      )}
    </MessageContent>
  );
}
