"use client";

import { CheckIcon, CrownIcon, ScaleIcon, WalletIcon, ZapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MODEL_TIER_OPTIONS,
  tierCookieValue,
  type ModelTierId,
} from "@/lib/ai/model-tiers";
import { getTierUi } from "@/lib/ai/tier-styles";

const TIER_ICONS: Record<ModelTierId, typeof ZapIcon> = {
  gratis: ZapIcon,
  hemat: WalletIcon,
  seimbang: ScaleIcon,
  premium: CrownIcon,
};

type ModelTierPickerProps = {
  value: ModelTierId;
  onChange: (tier: ModelTierId) => void;
  compact?: boolean;
  className?: string;
};

export function ModelTierPicker({
  value,
  onChange,
  compact = false,
  className,
}: ModelTierPickerProps) {
  return (
    <div
      className={cn(
        compact
          ? "grid grid-cols-2 gap-2 sm:grid-cols-4"
          : "grid gap-3 sm:grid-cols-2",
        className
      )}
      role="radiogroup"
      aria-label="Tingkat model AI"
    >
      {MODEL_TIER_OPTIONS.map((option) => {
        const selected = value === option.id;
        const Icon = TIER_ICONS[option.id];
        const ui = getTierUi(option.id);
        return (
          <button
            aria-checked={selected}
            className={cn(
              "group relative flex flex-col rounded-xl border text-left transition-all duration-200",
              compact ? "gap-1.5 p-3" : "gap-2.5 p-4",
              selected ? ui.cardSelected : ui.cardIdle,
              "hover:scale-[1.01] active:scale-[0.99]"
            )}
            key={option.id}
            onClick={() => onChange(option.id)}
            role="radio"
            type="button"
          >
            {selected ? (
              <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <CheckIcon className="size-3" />
              </span>
            ) : null}
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
                  selected ? ui.iconRing : "border-border/50 bg-muted/30 text-muted-foreground group-hover:border-border"
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span
                    className={cn(
                      "rounded px-1 py-px text-[9px] font-medium uppercase tracking-wider opacity-80",
                      selected ? ui.chip : "bg-muted text-muted-foreground"
                    )}
                  >
                    {ui.shortTag}
                  </span>
                </div>
                {!compact ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {option.requiresCredits ? "Butuh kredit OR" : "Tanpa kredit"}
                  </p>
                ) : null}
              </div>
            </div>
            {!compact ? (
              <p className="pr-8 text-[11px] leading-relaxed text-muted-foreground">
                {option.description}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function syncTierToChatCookie(tier: ModelTierId) {
  const val = tierCookieValue(tier);
  document.cookie = `chat-model=${encodeURIComponent(val)}; path=/; max-age=31536000; SameSite=Lax`;
}
