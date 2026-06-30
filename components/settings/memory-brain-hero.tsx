"use client";

import { BrainIcon, SparklesIcon } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { apiBasePath } from "@/lib/app-url";
import { cn } from "@/lib/utils";

const base = apiBasePath;

type MemoryBrainHeroProps = {
  memoryEnabled: boolean;
  visualEnabled: boolean;
};

export function MemoryBrainHero({
  memoryEnabled,
  visualEnabled,
}: MemoryBrainHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const src = `${base()}/videos/visual-memory-brain.mp4`;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    const onReady = () => setMediaReady(true);
    el.addEventListener("loadeddata", onReady);
    void el.play().catch(() => setMediaReady(false));
    return () => el.removeEventListener("loadeddata", onReady);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/40">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none z-0",
          "max-sm:mx-auto max-sm:mb-3 max-sm:size-[4.5rem]",
          "sm:absolute sm:-right-2 sm:top-1/2 sm:size-60 sm:-translate-y-1/2 md:size-[17rem] md:-right-4"
        )}
      >
        <NeuralOrb mediaReady={mediaReady} src={src} videoRef={videoRef} />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_100%_45%,rgba(99,102,241,0.1),transparent_50%)] max-sm:bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(99,102,241,0.08),transparent_60%)]"
      />

      <div className="relative z-[1] flex flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6 sm:pr-52 md:pr-60">
        <div className="flex items-start gap-4 max-sm:flex-col max-sm:items-center max-sm:text-center">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
            <BrainIcon className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 max-sm:w-full">
            <div className="flex flex-wrap items-center gap-2 max-sm:justify-center">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-primary/90">
                Visual Memory Core
              </span>
              <SparklesIcon className="size-3.5 text-violet-400/80" />
            </div>
            <h2 className="mt-1 text-base font-semibold tracking-tight sm:text-lg">
              Neural memory pipeline aktif
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:max-w-md sm:text-sm">
              Embedding semantik, recall kontekstual, dan visual memory — satu
              sistem ingatan terpadu VANDOR.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-sm:justify-center">
          <StatusPill
            active={memoryEnabled}
            label={memoryEnabled ? "Memori ON" : "Memori OFF"}
          />
          <StatusPill
            active={visualEnabled}
            label={visualEnabled ? "Visual ON" : "Visual OFF"}
          />
        </div>
      </div>
    </div>
  );
}

function NeuralOrb({
  src,
  videoRef,
  mediaReady,
}: {
  src: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  mediaReady: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn("relative size-full", !mediaReady && "animate-pulse")}
    >
      <div className="absolute inset-0 rounded-full border border-primary/20 bg-background/90" />
      <div className="absolute inset-[4%] rounded-full border border-dashed border-violet-500/20 animate-[spin_28s_linear_infinite] max-sm:inset-[6%]" />
      <div className="absolute inset-[12%] rounded-full border border-primary/10 animate-[spin_20s_linear_infinite_reverse] max-sm:hidden" />

      <div className="absolute inset-[8%] overflow-hidden rounded-full bg-black max-sm:inset-[10%]">
        <video
          autoPlay
          className={cn(
            "absolute left-1/2 top-1/2 min-h-[120%] min-w-[120%] -translate-x-1/2 -translate-y-1/2 object-cover",
            "mix-blend-screen [filter:contrast(1.2)_saturate(1.3)_brightness(1.08)]",
            "transition-opacity duration-700",
            mediaReady ? "opacity-100" : "opacity-0"
          )}
          loop
          muted
          playsInline
          preload="auto"
          ref={videoRef as RefObject<HTMLVideoElement>}
          src={src}
          tabIndex={-1}
        />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_42%,transparent_32%,hsl(var(--background))_90%)]" />
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-primary/25" />
      </div>

      {!mediaReady && (
        <div className="absolute inset-[8%] flex items-center justify-center rounded-full bg-primary/5">
          <BrainIcon className="size-5 text-primary/40 sm:size-8" />
        </div>
      )}

      <span className="absolute left-1/2 top-[2%] size-1 -translate-x-1/2 rounded-full bg-primary/50 max-sm:hidden" />
      <span className="absolute bottom-[8%] right-[20%] size-0.5 rounded-full bg-violet-400/40 max-sm:hidden" />
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/50 bg-background/60 text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "animate-pulse bg-primary" : "bg-muted-foreground/50"
        )}
      />
      {label}
    </span>
  );
}
