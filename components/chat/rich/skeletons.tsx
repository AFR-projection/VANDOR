"use client";

export function RichContentSkeleton() {
  return (
    <div className="mt-2 space-y-3" data-testid="rich-content-skeleton">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            className="aspect-[4/3] animate-pulse rounded-xl bg-muted"
            key={i}
          />
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            className="h-16 flex-1 animate-pulse rounded-xl bg-muted"
            key={i}
          />
        ))}
      </div>
    </div>
  );
}

export function SourcesSkeleton() {
  return (
    <div className="mt-4 space-y-2 border-t border-border/30 pt-3">
      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="h-20 animate-pulse rounded-xl bg-muted" key={i} />
        ))}
      </div>
    </div>
  );
}
