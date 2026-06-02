"use client";

import { ZapIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDataStream } from "./data-stream-provider";

function shorten(id: string): string {
  const last = id.split("/").pop() ?? id;
  return last.replace(/:free$/, "").slice(0, 28);
}

export function ModelMetaBadge() {
  const { latestModelMeta: latest } = useDataStream();

  if (!latest) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium tabular-nums ${
            latest.overridden
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border/50 bg-card/50 text-muted-foreground"
          }`}
          type="button"
        >
          {latest.overridden && <ZapIcon className="size-3" />}
          {shorten(latest.modelId)}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" side="bottom">
        <p className="font-medium">{latest.modelId}</p>
        {latest.overridden ? (
          <p className="mt-1 text-[11px] opacity-80">
            {latest.reason ?? "Auto-selected"}
            <br />
            <span className="opacity-70">
              Requested: {latest.requestedModelId}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-[11px] opacity-70">User-selected</p>
        )}
        {latest.attachments && latest.attachments.length > 0 && (
          <div className="mt-2 border-t border-border/30 pt-1.5">
            <p className="text-[10px] uppercase tracking-wider opacity-60">
              Files
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {latest.attachments.map((a) => (
                <li className="flex items-center gap-1.5" key={a.name}>
                  <span className="rounded bg-muted px-1 py-0.5 text-[9px] uppercase">
                    {a.kind}
                  </span>
                  <span className="truncate">{a.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
