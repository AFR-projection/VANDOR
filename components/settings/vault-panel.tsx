"use client";

import {
  CopyIcon,
  DownloadIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderLockIcon,
  Loader2Icon,
  MessageSquareIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { vaultFileTypes } from "@/lib/db/schema";
import type { VaultFileSnapshot } from "@/lib/vault/types";
import { cn } from "@/lib/utils";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type VaultPayload = {
  files: VaultFileSnapshot[];
  total: number;
  audit: Array<{
    id: string;
    action: string;
    fileId: string | null;
    detail: Record<string, unknown> | null;
    createdAt: string;
  }>;
  security: {
    encrypted: boolean;
    algorithm: string;
    storage: string;
    metadata: string;
  };
};

const typeLabels: Record<string, string> = {
  image: "Gambar",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  csv: "CSV",
  text: "Teks",
  code: "Kode",
  json: "JSON",
  archive: "Arsip",
  document: "Dokumen",
  other: "Lainnya",
};

const auditLabels: Record<string, string> = {
  upload: "Upload",
  download: "Unduh",
  delete: "Hapus",
  decrypt: "Buka/dekripsi",
  search: "Pencarian",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type === "image") return FileImageIcon;
  if (type === "video") return FileVideoIcon;
  if (type === "audio") return FileAudioIcon;
  if (type === "pdf" || type === "docx" || type === "text")
    return FileTextIcon;
  return FileIcon;
}

async function fetchVault(search: string, typeFilter: string): Promise<VaultPayload> {
  const params = new URLSearchParams({ limit: "80" });
  if (search.trim()) params.set("search", search.trim());
  if (typeFilter !== "all") params.set("type", typeFilter);
  const res = await fetch(`${base()}/api/settings/vault?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat berangkas");
  return res.json();
}

export function VaultPanel() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editTags, setEditTags] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const swrKey = `vault-${search}-${typeFilter}`;
  const { data, isLoading, mutate } = useSWR(swrKey, () =>
    fetchVault(search, typeFilter)
  );

  const files = data?.files ?? [];
  const selected = useMemo(
    () => files.find((f) => f.id === selectedId) ?? null,
    [files, selectedId]
  );

  const selectFile = useCallback((file: VaultFileSnapshot) => {
    setSelectedId(file.id);
    setEditName(file.name);
    setEditSummary(file.summary ?? "");
    setEditTags(file.tags.join(", "));
  }, []);

  const uploadFiles = useCallback(
    async (list: FileList | File[]) => {
      const arr = Array.from(list);
      if (arr.length === 0) return;
      setUploading(true);
      let ok = 0;
      for (const file of arr) {
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await fetch(`${base()}/api/vault/upload`, {
            method: "POST",
            body: form,
          });
          const json = await res.json();
          if (res.ok) {
            ok += 1;
            toast({
              type: "success",
              description: `Tersimpan terenkripsi: ${json.file?.name ?? file.name}`,
            });
          } else {
            toast({
              type: "error",
              description: json.error ?? "Upload gagal",
            });
          }
        } catch {
          toast({ type: "error", description: "Upload gagal — cek koneksi" });
        }
      }
      setUploading(false);
      if (ok > 0) await mutate();
      if (fileRef.current) fileRef.current.value = "";
    },
    [mutate]
  );

  const saveMeta = useCallback(async () => {
    if (!selected) return;
    setSavingMeta(true);
    try {
      const res = await fetch(`${base()}/api/vault/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: editName.trim() || undefined,
          summary: editSummary.trim() || undefined,
          tags: editTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        toast({ type: "error", description: "Gagal menyimpan tag/ringkasan" });
        return;
      }
      toast({ type: "success", description: "Metadata diperbarui" });
      await mutate();
    } finally {
      setSavingMeta(false);
    }
  }, [selected, editName, editSummary, editTags, mutate]);

  const deleteFile = useCallback(async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `Hapus "${selected.name}" dari berangkas? File terenkripsi di R2 ikut dihapus.`
      )
    ) {
      return;
    }
    const res = await fetch(`${base()}/api/vault/${selected.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast({ type: "error", description: "Gagal menghapus file" });
      return;
    }
    toast({ type: "success", description: "File dihapus dari berangkas" });
    setSelectedId(null);
    await mutate();
  }, [selected, mutate]);

  const copyOpenCmd = useCallback(() => {
    if (!selected) return;
    const cmd = `/v open ${selected.id}`;
    void navigator.clipboard.writeText(cmd);
    toast({ type: "success", description: "Perintah disalin — tempel di chat" });
  }, [selected]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <FolderLockIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Berangkas pribadi</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              File disimpan terenkripsi ({data?.security.algorithm ?? "AES-256-GCM"}) di{" "}
              {data?.security.storage ?? "R2"}. Metadata & pencarian di Neon.{" "}
              <strong className="text-foreground">Bukan</strong> sama dengan lampiran chat (📎).
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-background/60 px-3 py-2">
            <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-lg font-semibold tabular-nums leading-none">
                {data?.total ?? "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">file aman</p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, tag, ringkasan…"
            value={search}
          />
        </div>
        <Select onValueChange={setTypeFilter} value={typeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tipe</SelectItem>
            {vaultFileTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {typeLabels[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          type="button"
        >
          {uploading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <UploadIcon className="size-4" />
          )}
          <span className="ml-2">{uploading ? "Mengunggah…" : "/v up"}</span>
        </Button>
        <input
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xlsx,.csv,.txt,.json,.zip"
          className="hidden"
          multiple
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          ref={fileRef}
          type="file"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {isLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Memuat berangkas…
            </div>
          )}
          {!isLoading && files.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
              <FolderLockIcon className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">Berangkas kosong</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload lewat tombol di atas atau ketik <span className="font-mono">/v up</span> di chat.
              </p>
            </div>
          )}
          <ul className="max-h-[min(28rem,60vh)] space-y-2 overflow-y-auto pr-1 no-scrollbar">
            {files.map((file) => {
              const Icon = fileIcon(file.type);
              return (
                <li key={file.id}>
                  <button
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      selectedId === file.id
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/40 bg-card/30 hover:bg-muted/30"
                    )}
                    onClick={() => selectFile(file)}
                    type="button"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {typeLabels[file.type] ?? file.type} · {formatBytes(file.size)}
                      </p>
                      {file.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {file.tags.slice(0, 3).map((tag) => (
                            <span
                              className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              key={tag}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="min-h-[16rem] rounded-xl border border-border/40 bg-card/20 p-4 lg:col-span-3">
          {!selected && (
            <p className="text-sm text-muted-foreground">
              Pilih file untuk melihat detail, mengunduh, atau membuka di chat.
            </p>
          )}
          {selected && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold">{selected.name}</h3>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                  {selected.id}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {typeLabels[selected.type]} · {formatBytes(selected.size)} ·{" "}
                  {new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(selected.createdAt))}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <a
                    download
                    href={`${base()}/api/vault/${selected.id}/download`}
                    rel="noopener"
                  >
                    <DownloadIcon className="size-3.5" />
                    <span className="ml-1.5">Unduh</span>
                  </a>
                </Button>
                <Button onClick={copyOpenCmd} size="sm" type="button" variant="outline">
                  <MessageSquareIcon className="size-3.5" />
                  <span className="ml-1.5">Buka di chat</span>
                </Button>
                <Button onClick={copyOpenCmd} size="sm" type="button" variant="ghost">
                  <CopyIcon className="size-3.5" />
                </Button>
                <Button
                  className="text-destructive hover:text-destructive"
                  onClick={deleteFile}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="size-3.5" />
                  <span className="ml-1.5">Hapus</span>
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border border-border/30 bg-background/40 p-3">
                <Label className="text-xs">Nama file</Label>
                <Input
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama file di berangkas"
                  value={editName}
                />
                <Label className="text-xs">Ringkasan (aman untuk AI)</Label>
                <Textarea
                  className="min-h-[4rem] text-sm"
                  onChange={(e) => setEditSummary(e.target.value)}
                  placeholder="Contoh: Foto paspor, invoice Maret 2026…"
                  value={editSummary}
                />
                <Label className="text-xs">Tag (pisah koma)</Label>
                <Input
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="dokumen, keuangan, pribadi"
                  value={editTags}
                />
                <Button
                  disabled={savingMeta}
                  onClick={saveMeta}
                  size="sm"
                  type="button"
                >
                  {savingMeta ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : null}
                  Simpan metadata
                </Button>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                AI hanya melihat metadata di atas. Untuk analisis isi file, gunakan{" "}
                <span className="font-mono">/v open {selected.id.slice(0, 8)}…</span> di chat.
              </p>
            </div>
          )}
        </div>
      </div>

      {data?.audit && data.audit.length > 0 && (
        <section className="rounded-xl border border-border/30 bg-card/20 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Aktivitas berangkas terbaru
          </h3>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs no-scrollbar">
            {data.audit.map((row) => {
              const name =
                typeof row.detail?.fileName === "string"
                  ? row.detail.fileName
                  : null;
              return (
                <li
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-muted-foreground"
                  key={row.id}
                >
                  <span className="font-medium text-foreground">
                    {auditLabels[row.action] ?? row.action}
                  </span>
                  {name && <span className="truncate">{name}</span>}
                  <span className="text-[10px]">
                    {new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(row.createdAt))}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
