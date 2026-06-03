"use client";

import { useCallback } from "react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import {
  CHAT_MODE_OPTIONS,
  displayChatModeLabel,
  displayChatModeProvider,
} from "@/lib/ai/chat-modes";
import { OPENROUTER_FREE_MODEL_POOL } from "@/lib/ai/free-models";
import { persistModelTier, setChatModelCookie } from "@/lib/client/model-tier-sync";
import {
  MODEL_TIER_OPTIONS,
  normalizeModelTier,
  tierCookieValue,
  type ModelTierId,
} from "@/lib/ai/model-tiers";
import { getTierUi } from "@/lib/ai/tier-styles";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  CrownIcon,
  ScaleIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";

export { setChatModelCookie };

const TIER_ICONS = {
  gratis: ZapIcon,
  hemat: WalletIcon,
  seimbang: ScaleIcon,
  premium: CrownIcon,
} as const;

export function OpenRouterModelPicker({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const activeTier = normalizeModelTier(selectedModelId);
  const activeCookie = tierCookieValue(activeTier);
  const ui = getTierUi(activeTier);
  const provider = displayChatModeProvider(selectedModelId);

  const applyTier = useCallback(
    (tier: ModelTierId) => {
      const mode = tierCookieValue(tier);
      onModelChange?.(mode);
      setChatModelCookie(mode);
      void persistModelTier(tier).then((ok) => {
        if (!ok) {
          toast({
            type: "error",
            description: "Tier disimpan lokal; gagal sync ke akun.",
          });
          return;
        }
        toast({
          type: "success",
          description: `Tier ${getTierUi(tier).label} aktif`,
        });
      });
      setTimeout(() => {
        document
          .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
          ?.focus();
      }, 50);
    },
    [onModelChange]
  );

  return (
    <ModelSelector>
      <ModelSelectorTrigger asChild>
        <Button
          className={cn(
            "h-7 gap-1 rounded-lg border px-2 text-[12px] font-medium transition-all",
            ui.trigger
          )}
          data-testid="model-selector"
          title={MODEL_TIER_OPTIONS.find((o) => o.id === activeTier)?.description}
          variant="ghost"
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", ui.dot)} />
          <ModelSelectorLogo className="size-3.5" provider={provider} />
          <ModelSelectorName className="max-w-[72px] truncate">
            {displayChatModeLabel(selectedModelId)}
          </ModelSelectorName>
          <ChevronDownIcon className="size-3 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="w-[320px] overflow-hidden p-0">
        <div
          className={cn(
            "border-b border-border/40 bg-gradient-to-br px-3 py-3",
            ui.gradient
          )}
        >
          <p className="text-xs font-semibold text-foreground">Tingkat model</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Tersimpan ke akun. Tier Gratis memutar {OPENROUTER_FREE_MODEL_POOL.length}{" "}
            model saat limit.
          </p>
        </div>
        <ModelSelectorList>
          <div className="space-y-0.5 p-1.5">
            {CHAT_MODE_OPTIONS.map((option) => {
              const selected = activeCookie === option.id;
              const tier = option.tier as ModelTierId;
              const Icon = TIER_ICONS[tier];
              const tierUi = getTierUi(tier);
              const meta = MODEL_TIER_OPTIONS.find((o) => o.id === tier);
              return (
                <ModelSelectorItem
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg py-2.5 pr-2",
                    selected && "bg-accent/80"
                  )}
                  key={option.id}
                  onSelect={() => applyTier(tier)}
                  value={option.id}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
                      tierUi.iconRing
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <ModelSelectorLogo provider={option.provider} />
                        <ModelSelectorName className="text-sm font-semibold">
                          {option.label}
                        </ModelSelectorName>
                      </div>
                      {selected ? (
                        <CheckIcon className="size-4 shrink-0 text-primary" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                      {option.description}
                    </p>
                    {meta?.requiresCredits ? (
                      <p className="mt-1 text-[9px] font-medium text-amber-700/90 dark:text-amber-300/90">
                        Perlu saldo OpenRouter
                      </p>
                    ) : (
                      <p className="mt-1 text-[9px] font-medium text-emerald-700/90 dark:text-emerald-300/90">
                        Tanpa kredit
                      </p>
                    )}
                  </div>
                </ModelSelectorItem>
              );
            })}
          </div>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
