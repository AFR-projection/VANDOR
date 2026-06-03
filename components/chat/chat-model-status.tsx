"use client";

import { ArrowRightLeftIcon, Loader2Icon, Settings2Icon } from "lucide-react";
import Link from "next/link";
import type { UseChatHelpers } from "@ai-sdk/react";
import { displayOpenRouterModelName } from "@/lib/ai/model-display";
import { normalizeModelTier } from "@/lib/ai/model-tiers";
import { getTierUi } from "@/lib/ai/tier-styles";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDataStream } from "./data-stream-provider";
import type { ChatMessage } from "@/lib/types";

type ChatModelStatusProps = {
  selectedModelId: string;
  status: UseChatHelpers<ChatMessage>["status"];
};

export function ChatModelStatusStrip({
  selectedModelId,
  status,
}: ChatModelStatusProps) {
  const { latestModelMeta } = useDataStream();
  const tier = normalizeModelTier(selectedModelId);
  const ui = getTierUi(tier);
  const isMobile = useIsMobile();
  const busy = status === "submitted" || status === "streaming";
  const modelLabel = latestModelMeta
    ? displayOpenRouterModelName(latestModelMeta.modelId)
    : null;
  const rotating = Boolean(latestModelMeta?.fallbackUsed);

  if (isMobile && !busy && !rotating) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border/25 px-2.5 py-1.5 max-md:py-1 md:px-3 md:py-2",
        busy && "bg-muted/20"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            ui.chip
          )}
        >
          <span className={cn("size-1.5 rounded-full", ui.dot)} />
          {ui.label}
        </span>
        {busy ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
            <span className="truncate">
              {rotating ? "Mencoba model cadangan…" : "Menghubungi model…"}
            </span>
          </span>
        ) : modelLabel ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {modelLabel}
            {rotating ? (
              <ArrowRightLeftIcon className="ml-1 inline size-3 text-amber-600" />
            ) : null}
          </span>
        ) : (
          <span className="truncate text-[11px] text-muted-foreground/80">
            {tier === "gratis"
              ? "Rotasi otomatis jika limit"
              : "Orchestrator aktif"}
          </span>
        )}
      </div>
      <Link
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings`}
        title="Pengaturan Model & AI"
      >
        <Settings2Icon className="size-3" />
        <span className="hidden sm:inline">Atur</span>
      </Link>
    </div>
  );
}
