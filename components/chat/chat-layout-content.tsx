"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ActiveChatProvider } from "@/hooks/use-active-chat";
import { ChatShell } from "./shell";

export function ChatLayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSettings = pathname?.includes("/settings");

  if (isSettings) {
    return (
      <div className="flex h-dvh min-h-0 flex-col overflow-y-auto overscroll-behavior-contain">
        {children}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ActiveChatProvider>
        <ChatShell />
      </ActiveChatProvider>
      {children}
    </div>
  );
}
