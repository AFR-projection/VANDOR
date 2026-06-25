"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ParlayCsCardProps = {
  text: string;
  ticketId?: string | null;
  actualOdds?: number;
  returnFormatted?: string;
};

export function ParlayCsCard({
  text,
  ticketId,
  actualOdds,
  returnFormatted,
}: ParlayCsCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ type: "success", description: "Balasan CS disalin" });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast({ type: "error", description: "Gagal menyalin — coba manual" });
    }
  }, [text]);

  return (
    <div
      className="w-[min(100%,640px)] overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-card/40 shadow-[var(--shadow-card)]"
      data-testid="parlay-cs-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-[13px] text-foreground">
            Balasan CS · Mix Parlay
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {ticketId ? `#${ticketId}` : "Tiket parlay"}
            {actualOdds != null && ` · Odds ${actualOdds.toFixed(3)}`}
            {returnFormatted && ` · ${returnFormatted}`}
          </p>
        </div>
        <Button
          className={cn(
            "shrink-0 gap-1.5",
            copied && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          )}
          onClick={handleCopy}
          size="sm"
          type="button"
          variant={copied ? "outline" : "default"}
        >
          {copied ? (
            <>
              <CheckIcon className="size-3.5" />
              Tersalin
            </>
          ) : (
            <>
              <CopyIcon className="size-3.5" />
              Salin balasan
            </>
          )}
        </Button>
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-[12px] leading-relaxed text-foreground/90 sm:text-[13px]">
        {text}
      </pre>
    </div>
  );
}
