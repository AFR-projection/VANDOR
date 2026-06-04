"use client";

import { SparklesIcon } from "lucide-react";
import type { RichContent } from "@/lib/search/types";
import { ImageGallery } from "./image-gallery";
import { LocationCards } from "./location-card";
import { NewsCards } from "./news-card";
import { ProductCards } from "./product-card";
import { RelatedQuestions } from "./related-questions";
import { VideoCards } from "./video-card";
import { WebsitePreviewCards } from "./website-preview-card";

export function RichContentBlocks({
  rich,
  onAsk,
}: {
  rich: RichContent;
  onAsk: (question: string) => void;
}) {
  const hasSpecialized = Boolean(
    rich.images?.length ||
      rich.news?.length ||
      rich.videos?.length ||
      rich.products?.length ||
      rich.locations?.length
  );

  const hasAny =
    hasSpecialized ||
    (rich.websites?.length ?? 0) > 0 ||
    (rich.relatedQuestions?.length ?? 0) > 0;

  if (!hasAny) {
    return null;
  }

  return (
    <section className="mt-3 space-y-3 rounded-2xl border border-border/40 bg-muted/15 p-3 sm:p-4">
      <header className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <SparklesIcon className="size-3.5 text-primary/80" />
        Info & kartu web
        <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
          — klik sumber di jawaban untuk panel kanan
        </span>
      </header>
      {rich.images && rich.images.length > 0 && (
        <ImageGallery images={rich.images} />
      )}
      {rich.news && rich.news.length > 0 && <NewsCards news={rich.news} />}
      {rich.videos && rich.videos.length > 0 && (
        <VideoCards videos={rich.videos} />
      )}
      {rich.products && rich.products.length > 0 && (
        <ProductCards products={rich.products} />
      )}
      {rich.locations && rich.locations.length > 0 && (
        <LocationCards locations={rich.locations} />
      )}
      {!hasSpecialized && rich.websites && rich.websites.length > 0 && (
        <WebsitePreviewCards websites={rich.websites} />
      )}
      {rich.relatedQuestions && rich.relatedQuestions.length > 0 && (
        <RelatedQuestions onAsk={onAsk} questions={rich.relatedQuestions} />
      )}
    </section>
  );
}
