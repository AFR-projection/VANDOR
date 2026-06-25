"use client";

import {
  BrainIcon,
  ImageIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type MemoryCategory, memoryCategories } from "@/lib/db/schema";

type MemoryItem = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

type MemoryStats = {
  total: number;
  text: number;
  visual: number;
  byCategory: Record<MemoryCategory, number>;
};

import { apiBasePath } from "@/lib/app-url";
const base = apiBasePath;

async function fetchMemories(filter: string): Promise<MemoryItem[]> {
  const params = new URLSearchParams({ limit: "200" });
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

async function fetchStats(): Promise<MemoryStats> {
  const res = await fetch(`${base()}/api/memory/stats`);
  if (!res.ok) {
    throw new Error("Gagal memuat statistik");
  }
  const data = await res.json();
  return data.stats as MemoryStats;
}

const categoryLabels: Record<MemoryCategory, string> = {
  fact: "Fakta",
  preference: "Preferensi",
  goal: "Tujuan",
  person: "Orang",
  event: "Peristiwa",
  instruction: "Instruksi",
};

function MemoryStatsBar({ stats }: { stats: MemoryStats }) {
  const topCats = memoryCategories
    .map((c) => ({ c, n: stats.byCategory[c] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
          Total ingatan
        </p>
        <p className="text-2xl font-semibold tabular-nums">{stats.total}</p>
        <p className="text-[11px] text-muted-foreground">
          {stats.text} teks · {stats.visual} visual
        </p>
      </div>
      <div className="rounded-xl border border-border/40 bg-card/30 px-3 py-2.5 sm:col-span-2">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <BrainIcon className="size-3" />
          Per kategori
        </p>
        <div className="flex flex-wrap gap-1.5">
          {topCats.length === 0 ? (
            <span className="text-xs text-muted-foreground">Belum ada</span>
          ) : (
            topCats.map(({ c, n }) => (
              <span
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                key={c}
              >
                {categoryLabels[c]} {n}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function MemoryManager() {
  const [filter, setFilter] = useState<"all" | "text" | "visual">("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | "all">(
    "all"
  );
  const [sort, setSort] = useState<"recent" | "importance">("recent");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: stats } = useSWR("memory-stats", fetchStats, {
    revalidateOnFocus: false,
  });

  const {
    data: memories = [],
    mutate,
    isLoading,
  } = useSWR(["memories", filter], () => fetchMemories(filter), {
    revalidateOnFocus: false,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = memories;
    if (categoryFilter !== "all") {
      list = list.filter((m) => m.category === categoryFilter);
    }
    if (q) {
      list = list.filter((m) => m.content.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      if (sort === "importance") {
        return b.importance - a.importance;
      }
      const ta = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const tb = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return tb - ta;
    });
    return list;
  }, [memories, search, categoryFilter, sort]);

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
      toast({ type: "success", description: "Memori dihapus" });
    },
    [mutate]
  );

  const clearAll = useCallback(async () => {
    if (
      filter === "all" &&
      !confirm("Hapus SEMUA memori? Tidak bisa dibatalkan.")
    ) {
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
      {stats && <MemoryStatsBar stats={stats} />}

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
          Hapus{" "}
          {filter === "visual" ? "visual" : filter === "all" ? "semua" : ""}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari isi memori…"
            value={search}
          />
        </div>
        <Select
          onValueChange={(v) => setCategoryFilter(v as MemoryCategory | "all")}
          value={categoryFilter}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {memoryCategories.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabels[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(v) => setSort(v as "recent" | "importance")}
          value={sort}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Terbaru</SelectItem>
            <SelectItem value="importance">Penting</SelectItem>
          </SelectContent>
        </Select>
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

      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          Menampilkan {filtered.length} dari {memories.length} memori
        </p>
      )}

      <ul className="space-y-2">
        {filtered.map((m) => {
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
                    <span className="tabular-nums">
                      Penting {m.importance}/10
                    </span>
                    {m.updatedAt && (
                      <span>
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "short",
                        }).format(new Date(m.updatedAt))}
                      </span>
                    )}
                  </div>
                  <div
                    aria-hidden
                    className="mb-2 h-1 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all"
                      style={{ width: `${(m.importance / 10) * 100}%` }}
                    />
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

      {!isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search || categoryFilter !== "all"
            ? "Tidak ada memori yang cocok dengan filter."
            : "Belum ada memori tersimpan."}
        </p>
      )}
    </div>
  );
}
