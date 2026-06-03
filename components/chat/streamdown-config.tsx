"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { LinkSafetyConfig, LinkSafetyModalProps } from "streamdown";
import { Button } from "@/components/ui/button";

export const streamdownPlugins = { cjk, code, math, mermaid };

function isTrustedChatUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (
      host === "public.blob.vercel-storage.com" ||
      host.endsWith(".public.blob.vercel-storage.com")
    ) {
      return true;
    }
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function StreamdownLinkSafetyModal({
  isOpen,
  onClose,
  onConfirm,
  url,
}: LinkSafetyModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      data-streamdown="link-safety-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
    >
      <div
        className="relative max-w-md rounded-xl border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <p className="mb-2 font-semibold text-sm">Buka tautan eksternal?</p>
        <p className="mb-4 break-all text-muted-foreground text-xs">{url}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            Batal
          </Button>
          <Button onClick={onConfirm} size="sm" type="button">
            Buka
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Avoid Streamdown rendering link-safety modals inside `<p>` (hydration error). */
export const vandorStreamdownLinkSafety: LinkSafetyConfig = {
  enabled: true,
  onLinkCheck: (url) => isTrustedChatUrl(url),
  renderModal: (props) => <StreamdownLinkSafetyModal {...props} />,
};
