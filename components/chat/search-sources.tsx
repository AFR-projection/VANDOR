"use client";

import { useSourcePanel } from "@/hooks/use-source-panel";
import { parseStructuredWebResponse } from "@/lib/search/parse-response";
import type {
  RichContent,
  WebSearchOutput,
  WebSearchSource,
} from "@/lib/search/types";
import type { ChatMessage } from "@/lib/types";

function faviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return "";
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function getWebSourcesFromMessage(
  message: ChatMessage
): WebSearchOutput | null {
  for (const part of message.parts) {
    if (part.type === "data-web-sources" && "data" in part) {
      return part.data as WebSearchOutput;
    }
  }

  const textPart = message.parts.find((p) => p.type === "text");
  if (textPart?.type === "text" && textPart.text) {
    const parsed = parseStructuredWebResponse(textPart.text);
    if (parsed.parsedSources.length > 0) {
      return {
        query: "",
        sources: parsed.parsedSources,
        provider: "message",
      };
    }
  }

  return null;
}

/**
 * Merge every `data-rich-content` part on a message into a single object.
 * The server may stream cards first and follow-up questions later, so a
 * message can carry multiple parts that we fold together here.
 */
export function getRichContentFromMessage(
  message: ChatMessage
): RichContent | null {
  let merged: RichContent | null = null;

  for (const part of message.parts) {
    if (part.type === "data-rich-content" && "data" in part) {
      merged = { ...(merged ?? {}), ...(part.data as RichContent) };
    }
  }

  return merged;
}

export function getSearchStatusFromMessage(message: ChatMessage) {
  for (const part of message.parts) {
    if (part.type === "data-search-status" && "data" in part) {
      return part.data as { status: string; query?: string };
    }
  }
  return null;
}

/** @deprecated use parseStructuredWebResponse */
export function stripLegacyResponseFormat(text: string): string {
  return text
    .replace(/💬\s*ANSWER\s*\n?/gi, "")
    .replace(/🔗\s*SOURCES\s*\n[\s\S]*?(?=\n📌\s*NOTES|$)/gi, "")
    .replace(/📌\s*NOTES\s*\n?/gi, "")
    .trim();
}

export function WebSearchIndicator({
  query,
  sourceCount,
}: {
  query?: string;
  sourceCount?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground sm:text-[13px]">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-primary/70" />
      </span>
      <span>
        {sourceCount
          ? `Menemukan ${sourceCount} sumber`
          : query
            ? `Mencari: ${query.slice(0, 80)}${query.length > 80 ? "…" : ""}`
            : "Mencari informasi terbaru…"}
      </span>
    </div>
  );
}

export function SourceCitationBar({ sources }: { sources: WebSearchSource[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border/30 pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Sumber
      </p>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-2 sm:overflow-x-auto sm:pb-1 sm:[-ms-overflow-style:none] sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
        {sources.map((source, index) => (
          <SourceCitationPill
            allSources={sources}
            index={index + 1}
            key={source.url}
            source={source}
          />
        ))}
      </div>
    </div>
  );
}

function SourceCitationPill({
  source,
  index,
  allSources,
}: {
  source: WebSearchSource;
  index: number;
  allSources: WebSearchSource[];
}) {
  const favicon = faviconUrl(source.url);

  return (
    <CitationPillButton
      allSources={allSources}
      favicon={favicon}
      index={index}
      source={source}
    />
  );
}

function CitationPillButton({
  source,
  index,
  favicon,
  allSources,
}: {
  source: WebSearchSource;
  index: number;
  favicon: string;
  allSources: WebSearchSource[];
}) {
  const { openSource } = useSourcePanel();

  return (
    <button
      className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-border/40 bg-background/80 px-3 py-2.5 text-left shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-md sm:min-w-[200px] sm:max-w-[280px] sm:shrink-0"
      onClick={() =>
        openSource({
          url: source.url,
          title: source.title,
          snippet: source.snippet,
          relatedSources: allSources
            .filter((s) => s.url !== source.url)
            .slice(0, 10),
        })
      }
      type="button"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-4 rounded-sm"
            height={16}
            src={favicon}
            width={16}
          />
        ) : (
          index
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium leading-snug text-foreground">
          {source.title}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {hostname(source.url)}
        </span>
      </span>
    </button>
  );
}
