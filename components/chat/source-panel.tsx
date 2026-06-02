"use client";

import { ExternalLinkIcon, XIcon } from "lucide-react";
import { motion } from "framer-motion";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  useSourcePanel,
  useSourcePanelSelector,
} from "@/hooks/use-source-panel";
import type { ArticlePayload } from "@/lib/search/types";
import { cn } from "@/lib/utils";

async function fetchArticle(url: string): Promise<ArticlePayload> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/article?url=${encodeURIComponent(url)}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Gagal memuat artikel");
  }
  return data as ArticlePayload;
}

function readingTime(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes} min read`;
}

function ArticleBody({ content }: { content: string }) {
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <article className="mx-auto max-w-prose">
      {paragraphs.map((paragraph, index) => (
        <p
          className="mb-4 text-[15px] leading-[1.75] text-foreground/90 sm:mb-5 sm:text-[16px] sm:leading-[1.8] first:sm:text-[17px]"
          key={`${index}-${paragraph.slice(0, 32)}`}
        >
          {paragraph.trim()}
        </p>
      ))}
    </article>
  );
}

export function SourcePanel({ overlay = false }: { overlay?: boolean }) {
  const isVisible = useSourcePanelSelector((s) => s.isVisible);
  const url = useSourcePanelSelector((s) => s.url);
  const title = useSourcePanelSelector((s) => s.title);
  const { closeSourcePanel } = useSourcePanel();

  const { data, error, isLoading } = useSWR<ArticlePayload>(
    isVisible && url ? ["article", url] : null,
    () => fetchArticle(url),
    { revalidateOnFocus: false }
  );

  if (!isVisible) {
    return (
      <div
        aria-hidden
        className="h-dvh w-0 shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        data-testid="source-panel"
      />
    );
  }

  const displayTitle = data?.title ?? title;
  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex h-dvh shrink-0 flex-col overflow-hidden border-l border-border/50 bg-sidebar",
        overlay
          ? "fixed inset-0 z-50 w-full"
          : "hidden w-full lg:flex lg:w-[58%] xl:w-[60%]"
      )}
      data-testid="source-panel"
      initial={{ opacity: 0, x: overlay ? 0 : 24 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
    >
      <div className="flex shrink-0 flex-col gap-1 border-b border-border/50 bg-background/50 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug tracking-tight text-foreground">
              {displayTitle}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{hostname}</span>
              {data?.content && (
                <>
                  <span aria-hidden>·</span>
                  <span>{readingTime(data.content)}</span>
                </>
              )}
              {data?.cached && (
                <>
                  <span aria-hidden>·</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    Cached
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild size="icon-sm" type="button" variant="ghost">
              <a href={url} rel="noopener noreferrer" target="_blank">
                <ExternalLinkIcon size={14} />
                <span className="sr-only">Buka di tab baru</span>
              </a>
            </Button>
            <Button
              onClick={closeSourcePanel}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon size={14} />
              <span className="sr-only">Tutup panel</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-6 md:px-10 md:py-10">
        {isLoading && (
          <div className="mx-auto max-w-prose space-y-5">
            <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        )}

        {error && !isLoading && (
          <div className="mx-auto max-w-prose rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            Gagal memuat artikel.{" "}
            <a
              className="font-medium underline underline-offset-2"
              href={url}
              rel="noopener noreferrer"
              target="_blank"
            >
              Buka langsung di browser
            </a>
          </div>
        )}

        {data?.content && !isLoading && <ArticleBody content={data.content} />}
      </div>
    </motion.div>
  );
}

export function SourceLinkButton({
  title: sourceTitle,
  url: sourceUrl,
  className,
}: {
  title: string;
  url: string;
  className?: string;
}) {
  const { openSource } = useSourcePanel();

  return (
    <button
      className={cn(
        "group flex w-full items-start gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5",
        className
      )}
      onClick={() => openSource({ url: sourceUrl, title: sourceTitle })}
      type="button"
    >
      <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
          {sourceTitle}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {(() => {
            try {
              return new URL(sourceUrl).hostname.replace(/^www\./, "");
            } catch {
              return sourceUrl;
            }
          })()}
        </span>
      </span>
    </button>
  );
}
