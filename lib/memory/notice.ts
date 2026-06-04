import type { MemoryCategory } from "@/lib/db/schema";

export type SavedMemoryItem = {
  content: string;
  category: MemoryCategory;
};

export type MemorySavedNotice = {
  items: SavedMemoryItem[];
  source: "pre" | "post" | "explicit";
};

export function memorySavedDataPart(
  notice: MemorySavedNotice
): { type: "data-memory-saved"; data: MemorySavedNotice } {
  return { type: "data-memory-saved", data: notice };
}

export function formatMemorySavedToast(notice: MemorySavedNotice): string {
  const n = notice.items.length;
  if (n === 0) {
    return "";
  }
  const first = notice.items[0].content;
  const preview =
    first.length > 72 ? `${first.slice(0, 69)}…` : first;
  if (n === 1) {
    return `VANDOR mengingat: ${preview}`;
  }
  return `VANDOR mengingat ${n} hal — ${preview}`;
}
