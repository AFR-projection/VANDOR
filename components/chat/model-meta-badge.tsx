"use client";

import { ArrowRightLeftIcon, BotIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  describeModelSelection,
  displayOpenRouterModelName,
} from "@/lib/ai/model-display";
import { normalizeModelTier } from "@/lib/ai/model-tiers";
import { getTierUi } from "@/lib/ai/tier-styles";
import { cn } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";

export function ModelMetaBadge() {
  const { latestModelMeta: latest } = useDataStream();

  if (!latest) return null;

  const tier = latest.modelTier ? normalizeModelTier(latest.modelTier) : null;
  const ui = tier ? getTierUi(tier) : null;
  const rotated = Boolean(latest.fallbackUsed);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "inline-flex max-w-[min(100%,240px)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors",
            rotated
              ? "border-amber-500/45 bg-amber-500/10 text-amber-900 dark:text-amber-100"
              : "border-border/45 bg-card/60 text-muted-foreground hover:bg-card"
          )}
          type="button"
        >
          {rotated ? (
            <ArrowRightLeftIcon className="size-3 shrink-0 text-amber-600" />
          ) : latest.agentName ? (
            <BotIcon className="size-3 shrink-0 opacity-70" />
          ) : ui ? (
            <span className={cn("size-1.5 shrink-0 rounded-full", ui.dot)} />
          ) : null}
          <span className="truncate">
            {displayOpenRouterModelName(latest.modelId)}
          </span>
          {ui ? (
            <span
              className={cn(
                "shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider",
                ui.chip
              )}
            >
              {ui.label}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs rounded-xl p-3" side="bottom">
        <p className="text-xs font-medium leading-snug">
          {describeModelSelection(latest)}
        </p>
        <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
          {latest.modelId}
        </p>
        {latest.reason ? (
          <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed">
            {latest.reason}
          </p>
        ) : null}
        {latest.fallbackChain && latest.fallbackChain.length > 1 ? (
          <div className="mt-2 border-t border-border/40 pt-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rantai cadangan
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {latest.fallbackChain
                .slice(0, 4)
                .map((id) => displayOpenRouterModelName(id))
                .join(" → ")}
              {latest.fallbackChain.length > 4
                ? ` +${latest.fallbackChain.length - 4}`
                : ""}
            </p>
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
