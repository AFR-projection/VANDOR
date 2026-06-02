"use client";

import { ImageIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { memoryCategories, type MemoryCategory } from "@/lib/db/schema";
import { toast } from "@/components/chat/toast";

type MemoryItem = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function fetchMemories(filter: string): Promise<MemoryItem[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (filter !== "all") {
    params.set("filter", filter);
  }
  const res = await fetch(`${base()}/api/memory?${params}`);
  if (!res.ok) {
    throw new Error("Gagal memuat memori");
  }
  const data = await res.json();
  return data.memories as MemoryItem[];
}

const categoryLabels: Record<MemoryCategory, string> = {
  fact: "Fakta",
  preference: "Preferensi",
  goal: "Tujuan",
  person: "Orang",
  event: "Peristiwa",
  instruction: "Instruksi",
};

export function MemoryManager() {
  const [filter, setFilter] = useState<"all" | "text" | "visual">("all");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: memories = [], mutate, isLoading } = useSWR(
    ["memories", filter],
    () => fetchMemories(filter),
    { revalidateOnFocus: false }
  );

  const addMemory = useCallback(async () => {
    if (newContent.trim().length < 3) {
      return;
    }
    const res = await fetch(`${base()}/api/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: newContent.trim(),
        category: newCategory,
        importance: 7,
      }),
    });
    if (!res.ok) {
      toast({ type: "error", description: "Gagal menambah memori" });
      return;
    }
    setNewContent("");
    mutate();
    toast({ type: "success", description: "Memori ditambahkan" });
  }, [newContent, newCategory, mutate]);

  const saveEdit = useCallback(async () => {
    if (!editingId || editContent.trim().length < 3) {
      return;
    }
    const res = await fetch(`${base()}/api/memory/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent.trim() }),
    });
    if (!res.ok) {
      toast({ type: "error", description: "Gagal menyimpan" });
      return;
    }
    setEditingId(null);
    mutate();
    toast({ type: "success", description: "Memori diperbarui" });
  }, [editingId, editContent, mutate]);

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`${base()}/api/memory/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast({ type: "error", description: "Gagal menghapus" });
        return;
      }
      mutate();
    },
    [mutate]
  );

  const clearAll = useCallback(async () => {
    if (filter === "all" && !confirm("Hapus SEMUA memori? Tidak bisa dibatalkan.")) {
      return;
    }
    if (filter === "visual" && !confirm("Hapus semua memori visual?")) {
      return;
    }
    const res = await fetch(
      `${base()}/api/memory?visualOnly=${filter === "visual" ? "1" : "0"}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast({ type: "error", description: "Gagal menghapus" });
      return;
    }
    const data = await res.json();
    mutate();
    toast({
      type: "success",
      description: `${data.deleted ?? 0} memori dihapus`,
    });
  }, [filter, mutate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "text", "visual"] as const).map((f) => (
          <Button
            key={f}
            onClick={() => setFilter(f)}
            size="sm"
            type="button"
            variant={filter === f ? "default" : "outline"}
          >
            {f === "all" ? "Semua" : f === "visual" ? "Visual" : "Teks"}
          </Button>
        ))}
        <Button
          className="ml-auto text-destructive hover:text-destructive"
          onClick={clearAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          Hapus {filter === "visual" ? "visual" : filter === "all" ? "semua" : ""}
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border border-border/40 bg-card/20 p-4">
        <Label className="text-sm font-medium">Tambah memori manual</Label>
        <Textarea
          className="min-h-[72px] resize-none text-sm"
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Contoh: User lebih suka jawaban dalam Bahasa Indonesia"
          value={newContent}
        />
        <div className="flex flex-wrap gap-2">
          <Select
            onValueChange={(v) => setNewCategory(v as MemoryCategory)}
            value={newCategory}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memoryCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {categoryLabels[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addMemory} size="sm" type="button">
            Simpan
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Memuat memori…</p>
      )}

      <ul className="space-y-2">
        {memories.map((m) => {
          const isVisual =
            m.metadata &&
            typeof m.metadata === "object" &&
            (m.metadata as { visual?: boolean }).visual === true;

          return (
            <li
              className="rounded-xl border border-border/40 bg-background/60 p-3"
              key={m.id}
            >
              {editingId === m.id ? (
                <div className="space-y-2">
                  <Textarea
                    className="min-h-[80px] text-sm"
                    onChange={(e) => setEditContent(e.target.value)}
                    value={editContent}
                  />
                  <div className="flex gap-2">
                    <Button onClick={saveEdit} size="sm" type="button">
                      Simpan
                    </Button>
                    <Button
                      onClick={() => setEditingId(null)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                      {categoryLabels[m.category]}
                    </span>
                    {isVisual && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        <ImageIcon className="size-3" />
                        Visual
                      </span>
                    )}
                    <span>Penting: {m.importance}/10</span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {m.content}
                  </p>
                  <div className="mt-2 flex gap-1">
                    <Button
                      onClick={() => {
                        setEditingId(m.id);
                        setEditContent(m.content);
                      }}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <PencilIcon className="size-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      onClick={() => remove(m.id)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-3.5 text-destructive" />
                      <span className="sr-only">Hapus</span>
                    </Button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {!isLoading && memories.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Belum ada memori tersimpan.
        </p>
      )}
    </div>
  );
}
