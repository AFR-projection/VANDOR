"use client";

import { motion } from "framer-motion";
import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import type { LocationCard } from "@/lib/search/types";
import { MapWidget } from "../map-widget";
import { SmartImage } from "./smart-image";

export function LocationCards({ locations }: { locations: LocationCard[] }) {
  if (locations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {locations.map((location, index) => (
        <LocationItem
          index={index}
          key={`${location.name}-${location.lat ?? index}`}
          location={location}
        />
      ))}
    </div>
  );
}

function LocationItem({
  location,
  index,
}: {
  location: LocationCard;
  index: number;
}) {
  const hasCoords =
    typeof location.lat === "number" && typeof location.lng === "number";

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl border border-border/40 bg-card/40"
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: 0.04 * index, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <SmartImage
        alt={location.name}
        className="h-40 w-full object-cover"
        src={location.image}
      />
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MapPinIcon className="size-3.5 shrink-0 text-[var(--vandor-accent)]" />
              <span className="truncate">{location.name}</span>
            </p>
            {location.address && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {location.address}
              </p>
            )}
          </div>
          {location.mapUrl && (
            <a
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-[11px] transition-colors hover:bg-muted"
              href={location.mapUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Peta
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
        {location.description && (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {location.description}
          </p>
        )}
      </div>
      {hasCoords && (
        <div className="border-t border-border/40">
          <MapWidget
            data={{
              query: location.name,
              displayName: location.address,
              center: { lat: location.lat as number, lng: location.lng as number },
              osmUrl: location.mapUrl,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}
