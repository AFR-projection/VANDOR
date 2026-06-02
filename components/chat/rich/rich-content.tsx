"use client";

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

  return (
    <>
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
    </>
  );
}
