"use client";

import {
  BotIcon,
  BrainIcon,
  CircleHelpIcon,
  CpuIcon,
  FolderLockIcon,
  ImageIcon,
  MessageCircleIcon,
  ServerIcon,
  ShieldIcon,
  SmartphoneIcon,
  SparklesIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SettingsArea = "general" | "memory";

export type GeneralTabId =
  | "persona"
  | "model"
  | "skills"
  | "whatsapp"
  | "api"
  | "vault"
  | "operator"
  | "security"
  | "activity"
  | "guide";

export type MemoryTabId = "memory" | "visual" | "advanced" | "manage";

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  area: SettingsArea;
  /** Tab id dalam halaman general */
  tab?: GeneralTabId;
  /** Tab id dalam halaman memory */
  memoryTab?: MemoryTabId;
  /** Route absolut relatif base path */
  href?: "/settings" | "/settings/memory";
};

export type SettingsNavGroup = {
  id: string;
  label: string;
  items: SettingsNavItem[];
};

export const settingsNavGroups: SettingsNavGroup[] = [
  {
    id: "assistant",
    label: "Asisten",
    items: [
      {
        id: "persona",
        label: "Gaya bicara",
        icon: MessageCircleIcon,
        area: "general",
        tab: "persona",
        href: "/settings",
      },
      {
        id: "model",
        label: "Model & AI",
        icon: SparklesIcon,
        area: "general",
        tab: "model",
        href: "/settings",
      },
      {
        id: "skills",
        label: "Agent Skills",
        icon: WrenchIcon,
        area: "general",
        tab: "skills",
        href: "/settings",
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrasi",
    items: [
      {
        id: "whatsapp",
        label: "WhatsApp",
        icon: SmartphoneIcon,
        area: "general",
        tab: "whatsapp",
        href: "/settings",
      },
      {
        id: "api",
        label: "API & integrasi",
        icon: ServerIcon,
        area: "general",
        tab: "api",
        href: "/settings",
      },
      {
        id: "vault",
        label: "Berangkas",
        icon: FolderLockIcon,
        area: "general",
        tab: "vault",
        href: "/settings",
      },
    ],
  },
  {
    id: "system",
    label: "Sistem",
    items: [
      {
        id: "operator",
        label: "Operator AI",
        icon: BotIcon,
        area: "general",
        tab: "operator",
        href: "/settings",
      },
      {
        id: "memory-hub",
        label: "Memori",
        icon: BrainIcon,
        area: "memory",
        memoryTab: "memory",
        href: "/settings/memory",
      },
      {
        id: "security",
        label: "Keamanan",
        icon: ShieldIcon,
        area: "general",
        tab: "security",
        href: "/settings",
      },
      {
        id: "activity",
        label: "Log aktivitas",
        icon: TerminalIcon,
        area: "general",
        tab: "activity",
        href: "/settings",
      },
    ],
  },
  {
    id: "help",
    label: "Bantuan",
    items: [
      {
        id: "guide",
        label: "Panduan",
        icon: CircleHelpIcon,
        area: "general",
        tab: "guide",
        href: "/settings",
      },
    ],
  },
];

export const memorySubNav: Array<{
  id: MemoryTabId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "memory", label: "Memori teks", icon: BrainIcon },
  { id: "visual", label: "Visual memory", icon: ImageIcon },
  { id: "advanced", label: "Lanjutan", icon: CpuIcon },
  { id: "manage", label: "Kelola data", icon: WrenchIcon },
];

export function isNavItemActive(
  item: SettingsNavItem,
  ctx: {
    area: SettingsArea;
    generalTab?: GeneralTabId;
    memoryTab?: MemoryTabId;
  }
): boolean {
  if (item.area === "memory") {
    return ctx.area === "memory";
  }
  if (ctx.area !== "general") {
    return false;
  }
  return item.tab === ctx.generalTab;
}
