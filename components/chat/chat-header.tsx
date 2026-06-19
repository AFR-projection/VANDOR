"use client";

import { PanelLeftIcon } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { ModelMetaBadge } from "./model-meta-badge";

function PureChatHeader() {
  const { state, toggleSidebar, isMobile } = useSidebar();

  if (state === "collapsed" && !isMobile) {
    return null;
  }

  return (
    <header
      className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.05] bg-background/65 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-2xl max-md:h-12 md:h-14 md:gap-3 md:px-4"
      data-testid="chat-header"
    >
      <Button
        className="touch-manipulation md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <div className="flex items-center gap-2 md:hidden">
        <div className="size-1.5 rounded-full bg-foreground/80 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
        <span className="font-display font-medium text-sm tracking-tight">
          VANDOR
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2.5">
        <div className="hidden max-w-[200px] md:block">
          <ModelMetaBadge />
        </div>
        <span className="hidden rounded-full border border-white/[0.06] bg-zinc-900/40 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md md:inline">
          Private
        </span>
        <div className="hidden items-center gap-2 rounded-full border border-white/[0.06] bg-zinc-900/40 px-3 py-1 backdrop-blur-md md:flex">
          <div className="size-1.5 rounded-full bg-foreground/80 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
          <span className="font-display font-medium text-[12px] tracking-tight">
            VANDOR
          </span>
        </div>
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader);
