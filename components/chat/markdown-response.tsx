"use client";

import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";
import {
  streamdownPlugins,
  vandorStreamdownLinkSafety,
} from "@/components/chat/streamdown-config";
import { cn } from "@/lib/utils";

export type MarkdownResponseProps = ComponentProps<typeof Streamdown>;

export function MarkdownResponse({
  className,
  ...props
}: MarkdownResponseProps) {
  return (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      linkSafety={vandorStreamdownLinkSafety}
      plugins={streamdownPlugins}
      {...props}
    />
  );
}
