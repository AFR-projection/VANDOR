import type { MemoryCategory } from "@/lib/db/schema";

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "Preferensi",
  goal: "Tujuan",
  person: "Orang / relasi",
  instruction: "Instruksi tetap",
  event: "Peristiwa",
  fact: "Fakta",
};

export function formatMemoryCategoryHeading(cat: string): string {
  return (
    MEMORY_CATEGORY_LABELS[cat as MemoryCategory] ??
    cat.charAt(0).toUpperCase() + cat.slice(1)
  );
}
