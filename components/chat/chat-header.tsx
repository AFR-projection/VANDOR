"use client";

import { PanelLeftIcon } from "lucide-react";
import Link from "next/link";
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
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border/30 bg-sidebar/80 px-3 backdrop-blur-md">
      <Button
        className="md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <Link
        className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-sidebar-accent/50 md:hidden"
        href="/"
      >
        <span className="font-semibold text-sm tracking-tight">VANDOR</span>
      </Link>

      <div className="ml-auto hidden items-center gap-2 md:flex">
        <ModelMetaBadge />
        <span className="rounded-full border border-border/40 bg-card/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Private · Boss only
        </span>
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5">
          <span className="font-medium text-[13px]">VANDOR</span>
        </div>
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader);
