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
    <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 border-b border-border/30 bg-sidebar/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md max-md:h-12 md:h-14 md:gap-3 md:px-3">
      <Button
        className="touch-manipulation md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <span className="font-semibold text-sm tracking-tight md:hidden">
        VANDOR
      </span>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <div className="hidden max-w-[200px] md:block">
          <ModelMetaBadge />
        </div>
        <span className="hidden rounded-full border border-border/40 bg-card/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:inline">
          Private · Boss only
        </span>
        <div className="hidden items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 md:flex">
          <span className="font-medium text-[13px]">VANDOR</span>
        </div>
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader);
