"use client";

import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

/** Keeps mobile chat full-screen: no body scroll, sidebar sheet closed by default. */
export function MobileChatEffects() {
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();

  useEffect(() => {
    if (!isMobile) return;

    setOpenMobile(false);
    document.documentElement.classList.add("vandor-chat-mobile");
    return () => {
      document.documentElement.classList.remove("vandor-chat-mobile");
    };
  }, [isMobile, setOpenMobile]);

  return null;
}
