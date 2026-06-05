"use client";

import { motion } from "framer-motion";
import { useSourcePanel } from "@/hooks/use-source-panel";
import type { NewsCard } from "@/lib/search/types";
import { SmartImage } from "./smart-image";

function formatDate(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NewsCards({ news }: { news: NewsCard[] }) {
  if (news.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {news.map((item, index) => (
        <NewsItem index={index} item={item} key={item.url} />
      ))}
    </div>
  );
}

function NewsItem({ item, index }: { item: NewsCard; index: number }) {
  const date = formatDate(item.publishedDate);
  const { openSource } = useSourcePanel();

  return (
    <motion.button
      animate={{ opacity: 1, y: 0 }}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-border/40 bg-card/40 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-card)]"
      initial={{ opacity: 0, y: 10 }}
      onClick={() =>
        openSource({
          url: item.url,
          title: item.title,
          snippet: item.snippet,
        })
      }
      transition={{
        delay: 0.04 * index,
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      }}
      type="button"
    >
      <SmartImage
        alt={item.title}
        className="h-32 w-full object-cover"
        src={item.image}
      />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <SmartImage
            alt=""
            className="size-3.5 rounded-sm"
            src={item.favicon}
          />
          <span className="truncate font-medium">{item.source}</span>
          {date && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{date}</span>
            </>
          )}
        </span>
        <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground group-hover:text-primary">
          {item.title}
        </span>
        {item.snippet && (
          <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {item.snippet}
          </span>
        )}
      </div>
    </motion.button>
  );
}
