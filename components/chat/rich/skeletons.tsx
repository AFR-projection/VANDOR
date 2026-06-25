"use client";

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
