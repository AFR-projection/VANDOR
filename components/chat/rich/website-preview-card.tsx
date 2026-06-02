"use client";

import { motion } from "framer-motion";
import { ExternalLinkIcon } from "lucide-react";
import type { WebsiteCard } from "@/lib/search/types";

export function WebsitePreviewCards({ websites }: { websites: WebsiteCard[] }) {
  if (websites.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {websites.map((site, index) => (
        <WebsitePreview index={index} key={site.url} site={site} />
      ))}
    </div>
  );
}

function WebsitePreview({ site, index }: { site: WebsiteCard; index: number }) {
  return (
    <motion.a
      animate={{ opacity: 1, y: 0 }}
      className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/70 hover:shadow-[var(--shadow-card)]"
      href={site.url}
      initial={{ opacity: 0, y: 8 }}
      rel="noopener noreferrer"
      target="_blank"
      transition={{ delay: 0.04 * index, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border/40">
        {site.favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-5"
            height={20}
            referrerPolicy="no-referrer"
            src={site.favicon}
            width={20}
          />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {site.name.charAt(0)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
            {site.name}
          </span>
          <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        {site.description && (
          <span className="line-clamp-1 text-[11px] leading-snug text-muted-foreground">
            {site.description}
          </span>
        )}
        <span className="block truncate text-[10px] text-muted-foreground/70">
          {site.domain}
        </span>
      </span>
    </motion.a>
  );
}
