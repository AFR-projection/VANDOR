"use client";

import { BrainIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useDataStream } from "@/components/chat/data-stream-provider";
import { toast } from "@/components/chat/toast";
import {
  formatMemorySavedToast,
  type MemorySavedNotice,
} from "@/lib/memory/notice";
import type { ChatMessage } from "@/lib/types";

function noticeKey(notice: MemorySavedNotice): string {
  return notice.items.map((i) => `mem:${i.content}`).join("|");
}

function showMemoryToast(notice: MemorySavedNotice) {
  const description = formatMemorySavedToast(notice);
  if (!description) {
    return;
  }
  toast({ type: "success", description });
}

export function MemorySavedHandler({
  messages,
  status,
}: {
  messages: ChatMessage[];
  status: string;
}) {
  const { dataStream } = useDataStream();
  const seenRef = useRef(new Set<string>());
  const prevStatusRef = useRef(status);
  const turnStartedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }
    for (const delta of dataStream) {
      if (delta.type !== "data-memory-saved" || !("data" in delta)) {
        continue;
      }
      const notice = delta.data as MemorySavedNotice;
      const key = noticeKey(notice);
      if (seenRef.current.has(key)) {
        continue;
      }
      seenRef.current.add(key);
      showMemoryToast(notice);
    }
  }, [dataStream]);

  useEffect(() => {
    if (
      (status === "streaming" || status === "submitted") &&
      turnStartedRef.current == null
    ) {
      turnStartedRef.current = Date.now();
    }
  }, [status]);

  useEffect(() => {
    const wasBusy =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted";
    const isReady = status === "ready";

    if (wasBusy && isReady && turnStartedRef.current != null) {
      const sinceIso = new Date(turnStartedRef.current - 3000).toISOString();
      turnStartedRef.current = null;
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      fetch(`${base}/api/memory/recent?since=${encodeURIComponent(sinceIso)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: { memories?: { content: string; category: string }[] } | null
          ) => {
            if (!data?.memories?.length) {
              return;
            }
            const recent = data.memories.filter((m) => {
              const key = `mem:${m.content}`;
              if (seenRef.current.has(key)) {
                return false;
              }
              seenRef.current.add(key);
              return true;
            });
            if (recent.length === 0) {
              return;
            }
            showMemoryToast({
              items: recent.map((m) => ({
                content: m.content,
                category:
                  m.category as MemorySavedNotice["items"][0]["category"],
              })),
              source: "post",
            });
          }
        )
        .catch(() => null);
    }

    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "data-memory-saved" || !("data" in part)) {
          continue;
        }
        const notice = part.data as MemorySavedNotice;
        const key = `${message.id}:${noticeKey(notice)}`;
        if (seenRef.current.has(key)) {
          continue;
        }
        seenRef.current.add(key);
        showMemoryToast(notice);
      }
    }
  }, [messages]);

  return null;
}

export function MemorySavedBadge({ notice }: { notice: MemorySavedNotice }) {
  if (notice.items.length === 0) {
    return null;
  }
  const preview = notice.items[0].content;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground/90">
      <BrainIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span>
        <span className="font-medium text-primary">Tersimpan ke memori</span>
        {notice.items.length > 1 && (
          <span className="text-muted-foreground">
            {" "}
            · {notice.items.length} fakta
          </span>
        )}
        <span className="mt-0.5 block line-clamp-2 text-muted-foreground">
          {preview}
        </span>
      </span>
    </div>
  );
}
