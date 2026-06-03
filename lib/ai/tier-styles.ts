import type { ModelTierId } from "@/lib/ai/model-tiers";

export type TierUiStyle = {
  label: string;
  shortTag: string;
  iconRing: string;
  cardSelected: string;
  cardIdle: string;
  chip: string;
  trigger: string;
  gradient: string;
  dot: string;
};

export const TIER_UI: Record<ModelTierId, TierUiStyle> = {
  gratis: {
    label: "Gratis",
    shortTag: "0₽",
    iconRing: "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    cardSelected:
      "border-emerald-500/50 bg-gradient-to-br from-emerald-500/12 via-card/50 to-transparent ring-1 ring-emerald-500/25",
    cardIdle:
      "border-border/50 bg-card/40 hover:border-emerald-500/30 hover:bg-emerald-500/5",
    chip: "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    trigger:
      "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/10",
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    dot: "bg-emerald-500",
  },
  hemat: {
    label: "Hemat",
    shortTag: "$",
    iconRing: "border-sky-500/50 bg-sky-500/15 text-sky-600 dark:text-sky-400",
    cardSelected:
      "border-sky-500/50 bg-gradient-to-br from-sky-500/12 via-card/50 to-transparent ring-1 ring-sky-500/25",
    cardIdle:
      "border-border/50 bg-card/40 hover:border-sky-500/30 hover:bg-sky-500/5",
    chip: "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200",
    trigger:
      "border-sky-500/30 bg-sky-500/5 text-sky-800 dark:text-sky-200 hover:bg-sky-500/10",
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
    dot: "bg-sky-500",
  },
  seimbang: {
    label: "Seimbang",
    shortTag: "★",
    iconRing: "border-violet-500/50 bg-violet-500/15 text-violet-600 dark:text-violet-400",
    cardSelected:
      "border-violet-500/50 bg-gradient-to-br from-violet-500/12 via-card/50 to-transparent ring-1 ring-violet-500/25",
    cardIdle:
      "border-border/50 bg-card/40 hover:border-violet-500/30 hover:bg-violet-500/5",
    chip: "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    trigger:
      "border-violet-500/30 bg-violet-500/5 text-violet-800 dark:text-violet-200 hover:bg-violet-500/10",
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    dot: "bg-violet-500",
  },
  premium: {
    label: "Premium",
    shortTag: "◆",
    iconRing: "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400",
    cardSelected:
      "border-amber-500/50 bg-gradient-to-br from-amber-500/12 via-card/50 to-transparent ring-1 ring-amber-500/25",
    cardIdle:
      "border-border/50 bg-card/40 hover:border-amber-500/30 hover:bg-amber-500/5",
    chip: "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100",
    trigger:
      "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100 hover:bg-amber-500/10",
    gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
    dot: "bg-amber-500",
  },
};

export function getTierUi(tier: ModelTierId): TierUiStyle {
  return TIER_UI[tier];
}
