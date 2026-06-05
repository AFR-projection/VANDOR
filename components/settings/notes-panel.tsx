"use client";

import { BookMarkedIcon, Loader2Icon } from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type NoteRow = {
  index: number;
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
};

type NoteDetail = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

async function fetchNotes(): Promise<{ notes: NoteRow[] }> {
  const res = await fetch(`${base()}/api/settings/notes`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat catatan");
  return res.json();
}

export function NotesPanel() {
  const { data, isLoading } = useSWR("user-notes", fetchNotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openNote = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`${base()}/api/settings/notes/${id}`);
      const json = await res.json();
      if (res.ok) setDetail(json.note);
      else setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const notes = data?.notes ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2">
        <BookMarkedIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Catatan pribadi</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Simpan lewat chat: <span className="font-mono">/catat</span> atau minta
        VANDOR ingat. Daftar di sini sinkron dengan database.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Memuat…
        </div>
      )}

      {!isLoading && notes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Belum ada catatan. Coba <span className="font-mono">/catat</span> di
          chat.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/30 p-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Button
                className="h-auto w-full justify-start py-2 text-left"
                onClick={() => openNote(n.id)}
                type="button"
                variant={selectedId === n.id ? "secondary" : "ghost"}
              >
                <span className="font-mono text-[10px] text-muted-foreground mr-2">
                  {n.index}.
                </span>
                <span className="truncate text-sm font-medium">{n.title}</span>
              </Button>
            </li>
          ))}
        </ul>

        <div className="min-h-[12rem] rounded-lg border border-border/30 bg-background/40 p-3">
          {loadingDetail && (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          )}
          {!loadingDetail && !detail && (
            <p className="text-xs text-muted-foreground">
              Pilih judul untuk melihat isi lengkap.
            </p>
          )}
          {detail && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{detail.title}</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {detail.content}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Diperbarui:{" "}
                {new Intl.DateTimeFormat("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(detail.updatedAt))}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
