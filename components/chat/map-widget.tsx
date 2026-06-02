"use client";

import { ExternalLinkIcon, MapPinIcon } from "lucide-react";

export type MapWidgetData = {
  ok?: boolean;
  query?: string;
  displayName?: string;
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: Array<{
    lat: number;
    lng: number;
    label: string;
    kind?: string;
  }>;
  bbox?: [number, number, number, number];
  osmUrl?: string;
  embedUrl?: string;
  error?: string;
};

export function MapWidget({ data }: { data: MapWidgetData }) {
  if (data.error || data.ok === false) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
        {data.error ?? "Map unavailable."}
      </div>
    );
  }

  const center = data.center;
  if (!center) return null;

  const bbox = data.bbox;
  const embedSrc =
    data.embedUrl ??
    (bbox
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.join(",")}&layer=mapnik&marker=${center.lat},${center.lng}`
      : `https://www.openstreetmap.org/export/embed.html?bbox=${center.lng - 0.05},${center.lat - 0.05},${center.lng + 0.05},${center.lat + 0.05}&layer=mapnik&marker=${center.lat},${center.lng}`);

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 border-b border-border/40 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-sm">
            <MapPinIcon className="size-3.5 shrink-0 text-[var(--vandor-accent)]" />
            <span className="truncate">{data.query ?? "Peta"}</span>
          </div>
          {data.displayName && (
            <p className="mt-0.5 truncate text-muted-foreground text-xs">
              {data.displayName}
            </p>
          )}
        </div>
        {data.osmUrl && (
          <a
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-xs transition-colors hover:bg-muted"
            href={data.osmUrl}
            rel="noreferrer"
            target="_blank"
          >
            Buka peta
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
      <div className="relative aspect-[16/10] w-full min-h-[240px] bg-muted/30">
        <iframe
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={embedSrc}
          title={data.displayName ?? data.query ?? "Peta interaktif"}
        />
      </div>
      {(data.markers?.length ?? 0) > 1 && (
        <div className="border-t border-border/40 px-3 py-2 text-muted-foreground text-xs">
          {data.markers?.length} lokasi · geser & zoom di peta
        </div>
      )}
    </div>
  );
}
