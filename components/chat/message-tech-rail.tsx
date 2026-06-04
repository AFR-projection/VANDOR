"use client";

import {
  ArrowRightLeftIcon,
  BrainIcon,
  ChevronDownIcon,
  CpuIcon,
  GlobeIcon,
  GaugeIcon,
  SparklesIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  describeModelSelection,
  displayOpenRouterModelName,
} from "@/lib/ai/model-display";
import { normalizeModelTier } from "@/lib/ai/model-tiers";
import { getTierUi } from "@/lib/ai/tier-styles";
import type { MemorySavedNotice } from "@/lib/memory/notice";
import type { ModelMeta } from "@/lib/types";
import type { TurnUsageEstimate } from "@/lib/v4/turn-usage";
import { cn } from "@/lib/utils";

function MetaPill({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/35 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground shadow-sm",
        className
      )}
      title={title}
    >
      {children}
    </span>
  );
}

export function MessageTechRail({
  modelMeta,
  turnUsage,
  memoryNotice,
  memoryRecall,
  webSourceCount = 0,
}: {
  modelMeta?: ModelMeta | null;
  turnUsage?: TurnUsageEstimate | null;
  memoryNotice?: MemorySavedNotice | null;
  memoryRecall?: { active: boolean; charCount: number } | null;
  webSourceCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasMemory =
    memoryNotice != null && memoryNotice.items.length > 0;
  const hasRecall = memoryRecall?.active === true;
  const hasUsage = turnUsage != null;
  const hasModel = modelMeta != null;
  const hasWeb = webSourceCount > 0;

  if (!hasModel && !hasUsage && !hasMemory && !hasWeb && !hasRecall) {
    return null;
  }

  const tier = modelMeta?.modelTier
    ? normalizeModelTier(modelMeta.modelTier)
    : null;
  const tierUi = tier ? getTierUi(tier) : null;
  const modelShort = modelMeta
    ? displayOpenRouterModelName(modelMeta.modelId)
    : null;
  const totalEst =
    hasUsage && turnUsage
      ? turnUsage.inputTokensEst + turnUsage.maxOutputTokens
      : 0;

  return (
    <div
      className="mt-2 rounded-lg border border-border/20 bg-gradient-to-r from-muted/20 via-transparent to-muted/10 px-2 py-1.5 opacity-70 transition-opacity duration-200 group-hover/message:opacity-100"
      data-testid="message-tech-rail"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-widest text-muted-foreground/70">
        <SparklesIcon className="size-2.5 text-primary/60" />
        VANDOR meta
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {hasRecall && (
          <MetaPill
            className="border-violet-500/30 bg-violet-500/8 text-violet-700 dark:text-violet-300"
            title="Konteks memori jangka panjang disuntikkan ke model"
          >
            <BrainIcon className="size-2.5 shrink-0" />
            <span>recall</span>
            {turnUsage && turnUsage.memoryTokensEst > 0 && (
              <span className="tabular-nums opacity-80">
                ~{turnUsage.memoryTokensEst}t
              </span>
            )}
          </MetaPill>
        )}

        {hasModel && modelMeta && (
          <MetaPill
            className={cn(
              modelMeta.fallbackUsed &&
                "border-amber-500/35 bg-amber-500/8 text-amber-800 dark:text-amber-200"
            )}
            title={describeModelSelection(modelMeta)}
          >
            {modelMeta.fallbackUsed ? (
              <ArrowRightLeftIcon className="size-2.5 shrink-0" />
            ) : (
              <CpuIcon className="size-2.5 shrink-0 opacity-60" />
            )}
            <span className="max-w-[140px] truncate">{modelShort}</span>
            {tierUi ? (
              <span
                className={cn(
                  "rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider",
                  tierUi.chip
                )}
              >
                {tierUi.label}
              </span>
            ) : null}
          </MetaPill>
        )}

        {hasUsage && turnUsage && (
          <MetaPill title="Estimasi token (bukan tagihan resmi)">
            <GaugeIcon className="size-2.5 shrink-0 opacity-60" />
            <span className="tabular-nums">
              {turnUsage.inputTokensEst.toLocaleString("id-ID")}↓
            </span>
            <span className="opacity-40">·</span>
            <span className="tabular-nums">
              {turnUsage.maxOutputTokens.toLocaleString("id-ID")}↑
            </span>
            <span className="opacity-40">·</span>
            <span className="tabular-nums opacity-80">
              ~{totalEst.toLocaleString("id-ID")}
            </span>
          </MetaPill>
        )}

        {hasUsage && turnUsage && turnUsage.webTokensEst > 0 && (
          <MetaPill title="Token konteks web">
            <GlobeIcon className="size-2.5 shrink-0 opacity-60" />
            <span className="tabular-nums">web {turnUsage.webTokensEst}</span>
          </MetaPill>
        )}

        {hasWeb && (
          <MetaPill title="Sumber web search">
            <GlobeIcon className="size-2.5 shrink-0 opacity-60" />
            <span>{webSourceCount} sumber</span>
          </MetaPill>
        )}

        {hasMemory && memoryNotice && (
          <MetaPill
            className="border-primary/25 bg-primary/8 text-primary"
            title={memoryNotice.items.map((i) => i.content).join("\n")}
          >
            <BrainIcon className="size-2.5 shrink-0" />
            <span>+{memoryNotice.items.length} simpan</span>
          </MetaPill>
        )}

        {(hasModel || hasUsage || hasMemory || hasRecall) && (
          <button
            aria-expanded={expanded}
            className="ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            type="button"
          >
            detail
            <ChevronDownIcon
              className={cn(
                "size-3 transition-transform",
                expanded && "rotate-180"
              )}
            />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 rounded-md border border-border/20 bg-background/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {hasRecall && memoryRecall && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
                Memori aktif
              </p>
              <p className="mt-0.5">
                ~{memoryRecall.charCount} karakter konteks memori di prompt
              </p>
            </div>
          )}
          {hasModel && modelMeta && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">
                Model
              </p>
              <p className="mt-0.5 break-all">{modelMeta.modelId}</p>
              {modelMeta.reason ? (
                <p className="mt-1 leading-snug opacity-90">{modelMeta.reason}</p>
              ) : null}
            </div>
          )}
          {hasUsage && turnUsage && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">
                Token
              </p>
              <p className="mt-0.5 tabular-nums">
                history ~{turnUsage.historyTokensEst} · files ~
                {turnUsage.filesTokensEst}
                {turnUsage.intent ? ` · ${turnUsage.intent}` : ""}
              </p>
            </div>
          )}
          {hasMemory && memoryNotice && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">
                Baru disimpan
              </p>
              <ul className="mt-1 list-inside list-disc">
                {memoryNotice.items.map((item) => (
                  <li className="line-clamp-2" key={item.content}>
                    {item.content}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
