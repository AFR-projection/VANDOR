"use client";

import { useRouter } from "next/navigation";
import { SparklesIcon } from "./icons";

export function Preview() {
  const router = useRouter();

  const handleStart = () => {
    router.push("/");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-tl-2xl bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/20 px-5">
        <div className="flex size-5 items-center justify-center rounded bg-muted/60 ring-1 ring-border/50">
          <SparklesIcon size={10} />
        </div>
        <span className="font-medium text-[13px] text-muted-foreground">
          VANDOR
        </span>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/4 left-1/2 size-48 -translate-x-1/2 rounded-full opacity-50 blur-[80px]"
          style={{ background: "var(--vandor-accent-glow)" }}
        />
        <div className="relative text-center">
          <h2 className="font-display text-2xl font-light tracking-tight">
            <span className="text-muted-foreground/50">VANDOR siap,</span>{" "}
            <span className="text-foreground">Boss.</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground/70">
            Asisten pribadi dengan memori jangka panjang.
          </p>
        </div>
        <button
          className="rounded-full border border-border/40 bg-card/30 px-5 py-2 text-[12px] text-muted-foreground transition-all hover:border-border/70 hover:bg-card/50 hover:text-foreground"
          onClick={handleStart}
          type="button"
        >
          Mulai percakapan
        </button>
      </div>
    </div>
  );
}
