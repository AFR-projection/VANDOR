"use client";

import { Toaster } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export function ChatToaster() {
  const isMobile = useIsMobile();

  return (
    <Toaster
      closeButton={!isMobile}
      position={isMobile ? "bottom-center" : "top-center"}
      theme="system"
      toastOptions={{
        className:
          "!bg-card !text-foreground !border-border/50 !shadow-[var(--shadow-float)]",
        style: isMobile
          ? { marginBottom: "max(0.5rem, env(safe-area-inset-bottom))" }
          : undefined,
      }}
    />
  );
}
