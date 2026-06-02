"use client";

import { motion } from "framer-motion";
import { useSourcePanel } from "@/hooks/use-source-panel";
import type { WebSearchSource } from "@/lib/search/types";

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconUrl(url: string, fallback?: string): string {
  if (fallback) {
    return fallback;
  }
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

export function SourceCards({ sources }: { sources: WebSearchSource[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border/30 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Sumber
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
          {sources.length}
        </span>
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sources.map((source, index) => (
          <SourceCard index={index + 1} key={source.url} source={source} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  index,
}: {
  source: WebSearchSource;
  index: number;
}) {
  const { openSource } = useSourcePanel();
  const favicon = faviconUrl(source.url, source.favicon);
  const domain = hostname(source.url);

  return (
    <motion.button
      animate={{ opacity: 1, y: 0 }}
      className="group flex min-w-0 flex-col gap-1.5 rounded-xl border border-border/40 bg-background/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md"
      initial={{ opacity: 0, y: 8 }}
      onClick={() => openSource({ url: source.url, title: source.title })}
      transition={{ delay: 0.03 * index, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-4 shrink-0 rounded-sm"
            height={16}
            referrerPolicy="no-referrer"
            src={favicon}
            width={16}
          />
        ) : (
          <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold text-muted-foreground">
            {index}
          </span>
        )}
        <span className="truncate text-[11px] text-muted-foreground">
          {domain}
        </span>
      </span>
      <span className="line-clamp-1 text-xs font-medium leading-snug text-foreground group-hover:text-primary">
        {source.title}
      </span>
      {source.snippet && (
        <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {source.snippet}
        </span>
      )}
    </motion.button>
  );
}
