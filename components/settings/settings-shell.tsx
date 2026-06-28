"use client";

import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { apiBasePath } from "@/lib/app-url";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import {
  isNavItemActive,
  memorySubNav,
  type GeneralTabId,
  type MemoryTabId,
  type SettingsArea,
  settingsNavGroups,
} from "./settings-nav-config";

const base = apiBasePath;

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "space-y-4 rounded-2xl border border-border/40 bg-card/25 p-4 sm:p-5",
        className
      )}
    >
      <header className="space-y-1 border-b border-border/30 pb-3">
        <h2 className="font-semibold text-sm tracking-tight">{title}</h2>
        {description ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

type SettingsShellProps = {
  area: SettingsArea;
  generalTab?: GeneralTabId;
  memoryTab?: MemoryTabId;
  onGeneralTabChange?: (tab: GeneralTabId) => void;
  onMemoryTabChange?: (tab: MemoryTabId) => void;
  saving?: boolean;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function SettingsShell({
  area,
  generalTab,
  memoryTab,
  onGeneralTabChange,
  onMemoryTabChange,
  saving,
  headerExtra,
  children,
}: SettingsShellProps) {
  const router = useRouter();

  const handleNav = (item: (typeof settingsNavGroups)[number]["items"][number]) => {
    if (item.area === "memory") {
      const q =
        item.memoryTab && item.memoryTab !== "memory"
          ? `?tab=${item.memoryTab}`
          : "";
      router.push(`${base()}/settings/memory${q}`);
      return;
    }
    if (item.tab) {
      if (area !== "general") {
        router.push(`${base()}/settings#${item.tab}`);
        return;
      }
      onGeneralTabChange?.(item.tab);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3 sm:px-6">
        <Button asChild size="icon-sm" type="button" variant="ghost">
          <Link href="/">
            <ArrowLeftIcon className="size-4" />
            <span className="sr-only">Kembali ke chat</span>
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Pengaturan
          </h1>
          <p className="text-xs text-muted-foreground">
            {area === "memory"
              ? "Memori jangka panjang & retrieval"
              : "Asisten, integrasi, keamanan"}{" "}
            · {APP_NAME}{" "}
            <span className="font-mono text-[10px]">v{APP_VERSION}</span>
          </p>
        </div>
        {headerExtra}
        {saving ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            Menyimpan…
          </span>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-border/40 lg:w-60 lg:border-b-0 lg:border-r">
          <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:p-3">
            {settingsNavGroups.map((group) => (
              <div className="shrink-0 lg:mb-4 lg:w-full" key={group.id}>
                <p className="mb-1.5 hidden px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 lg:block">
                  {group.label}
                </p>
                <div className="flex gap-1 lg:flex-col">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isNavItemActive(item, {
                      area,
                      generalTab,
                      memoryTab,
                    });
                    return (
                      <button
                        className={cn(
                          "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-all lg:w-full",
                          active
                            ? "bg-primary/12 font-medium text-primary ring-1 ring-primary/20"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                        key={item.id}
                        onClick={() => handleNav(item)}
                        type="button"
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {area === "memory" ? (
            <div className="shrink-0 border-b border-border/40 px-4 py-2 sm:px-6">
              <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto">
                {memorySubNav.map((t) => {
                  const Icon = t.icon;
                  const active = memoryTab === t.id;
                  return (
                    <button
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      key={t.id}
                      onClick={() => onMemoryTabChange?.(t.id)}
                      type="button"
                    >
                      <Icon className="size-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
