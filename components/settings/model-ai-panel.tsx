"use client";

import {
  ExternalLinkIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import {
  ModelTierPicker,
  syncTierToChatCookie,
} from "@/components/settings/model-tier-picker";
import { displayOpenRouterModelName } from "@/lib/ai/model-display";
import { OPENROUTER_FREE_MODEL_POOL } from "@/lib/ai/free-models";
import { MODEL_TIER_OPTIONS, type ModelTierId } from "@/lib/ai/model-tiers";
import { getTierUi } from "@/lib/ai/tier-styles";
import { cn } from "@/lib/utils";

type ModelAiPanelProps = {
  modelTier: ModelTierId;
  onTierChange: (tier: ModelTierId) => void;
  onOpenApiTab?: () => void;
  saving?: boolean;
};

export function ModelAiPanel({
  modelTier,
  onTierChange,
  onOpenApiTab,
  saving,
}: ModelAiPanelProps) {
  const activeUi = getTierUi(modelTier);
  const activeMeta = MODEL_TIER_OPTIONS.find((o) => o.id === modelTier);

  return (
    <div className="space-y-5">
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border p-4 sm:p-5",
          "border-primary/15 bg-gradient-to-br",
          activeUi.gradient
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-6 -top-6 size-28 rounded-full blur-3xl opacity-40",
            activeUi.dot
          )}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl border",
                activeUi.iconRing
              )}
            >
              <SparklesIcon className="size-5" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Tier aktif
              </p>
              <h2 className="text-lg font-semibold tracking-tight">
                {activeUi.label}
              </h2>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {activeMeta?.description}
              </p>
            </div>
          </div>
          {saving ? (
            <span className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              <RefreshCwIcon className="size-3 animate-spin" />
              Menyimpan…
            </span>
          ) : (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                activeUi.chip
              )}
            >
              Tersimpan
            </span>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Pilih tier</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Perubahan langsung dipakai di chat. Cookie & akun disinkronkan otomatis.
        </p>
        <ModelTierPicker
          value={modelTier}
          onChange={(tier) => {
            syncTierToChatCookie(tier);
            onTierChange(tier);
          }}
        />
      </section>

      {modelTier === "gratis" ? (
        <section className="space-y-3 overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06]">
          <div className="flex items-center gap-2 border-b border-emerald-500/15 px-4 py-3">
            <RefreshCwIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                Rotasi {OPENROUTER_FREE_MODEL_POOL.length} model gratis
              </h3>
              <p className="text-[10px] text-emerald-800/80 dark:text-emerald-200/80">
                Urutan dicoba saat rate limit
              </p>
            </div>
          </div>
          <ol className="max-h-56 space-y-2 overflow-y-auto px-4 py-3">
            {OPENROUTER_FREE_MODEL_POOL.map((id, i) => (
              <li
                className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/40 px-2.5 py-2"
                key={id}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {displayOpenRouterModelName(id)}
                  </p>
                  <p className="truncate font-mono text-[9px] text-muted-foreground">
                    {id}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-emerald-500/15 px-4 py-3">
            <a
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-200"
              href="https://openrouter.ai/settings/privacy"
              rel="noreferrer"
              target="_blank"
            >
              <ShieldCheckIcon className="size-3.5" />
              Aktifkan privasi untuk model :free
              <ExternalLinkIcon className="size-3 opacity-70" />
            </a>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border/40 bg-muted/15 p-4">
          <p className="text-xs font-medium text-foreground">OpenRouter berbayar</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Tier ini memakai model berkualitas tinggi. Pastikan saldo cukup agar
            respons tidak terputus.
          </p>
          <a
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[11px] font-medium transition-colors hover:bg-muted/50"
            href="https://openrouter.ai/credits"
            rel="noreferrer"
            target="_blank"
          >
            Kelola kredit
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </section>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        API key di tab{" "}
        <button
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={onOpenApiTab}
          type="button"
        >
          API & integrasi
        </button>
      </p>
    </div>
  );
}
