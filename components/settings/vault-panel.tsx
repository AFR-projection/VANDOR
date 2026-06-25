"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckIcon,
  DownloadIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderLockIcon,
  Loader2Icon,
  MessageSquareIcon,
  PencilIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { VaultDownloadButton } from "@/components/chat/vault-download-button";
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
import { cn, formatBytes } from "@/lib/utils";
import { apiBasePath } from "@/lib/app-url";

type VaultPayload = {
  files: VaultFileSnapshot[];
  total: number;
  filteredCount?: number;
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
    storageLabel: string;
    activeBackend: "r2" | "local" | "none";
    metadata: string;
    publicAccess: false;
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

const typeColors: Record<string, string> = {
  image: "text-pink-500 bg-pink-500/10",
  video: "text-violet-500 bg-violet-500/10",
  audio: "text-blue-500 bg-blue-500/10",
  pdf: "text-red-500 bg-red-500/10",
  docx: "text-blue-600 bg-blue-600/10",
  pptx: "text-orange-500 bg-orange-500/10",
  xlsx: "text-green-600 bg-green-600/10",
  csv: "text-teal-500 bg-teal-500/10",
  text: "text-slate-500 bg-slate-500/10",
  code: "text-amber-500 bg-amber-500/10",
  json: "text-yellow-500 bg-yellow-500/10",
  archive: "text-purple-500 bg-purple-500/10",
  document: "text-indigo-500 bg-indigo-500/10",
  other: "text-gray-500 bg-gray-500/10",
};

const auditLabels: Record<string, string> = {
  upload: "Upload",
  download: "Unduh",
  delete: "Hapus",
  decrypt: "Buka/dekripsi",
  search: "Pencarian",
};

function fileIcon(type: string) {
  if (type === "image") return FileImageIcon;
  if (type === "video") return FileVideoIcon;
  if (type === "audio") return FileAudioIcon;
  if (type === "pdf" || type === "docx" || type === "text") return FileTextIcon;
  return FileIcon;
}

async function fetchVault(
  search: string,
  typeFilter: string
): Promise<VaultPayload> {
  const params = new URLSearchParams({ limit: "80" });
  if (search.trim()) params.set("search", search.trim());
  if (typeFilter !== "all") params.set("type", typeFilter);
  const res = await fetch(`${apiBasePath()}/api/settings/vault?${params}`, {
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
  const [isDragging, setIsDragging] = useState(false);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editTags, setEditTags] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const swrKey = `vault-${search}-${typeFilter}`;
  const { data, isLoading, mutate } = useSWR(swrKey, () =>
    fetchVault(search, typeFilter)
  );

  const files = data?.files ?? [];
  const total = data?.total ?? 0;
  const filterActive = search.trim().length > 0 || typeFilter !== "all";
  const filteredEmpty = !isLoading && files.length === 0 && total > 0 && filterActive;
  const trulyEmpty = !isLoading && total === 0;
  const selected = useMemo(
    () => files.find((f) => f.id === selectedId) ?? null,
    [files, selectedId]
  );

  const selectFile = useCallback((file: VaultFileSnapshot) => {
    setSelectedId(file.id);
    setEditName(file.name);
    setEditSummary(file.summary ?? "");
    setEditTags(file.tags.join(", "));
    setIsEditingName(false);
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
          const res = await fetch(`${apiBasePath()}/api/vault/upload`, {
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
      const res = await fetch(`${apiBasePath()}/api/vault/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          summary: editSummary.trim() || undefined,
          tags: editTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        toast({ type: "error", description: "Gagal menyimpan perubahan" });
        return;
      }
      toast({ type: "success", description: "File diperbarui" });
      setIsEditingName(false);
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
    const res = await fetch(`${apiBasePath()}/api/vault/${selected.id}`, {
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

  const openInChat = useCallback(() => {
    if (!selected) return;
    void navigator.clipboard.writeText(`/share-to-ai ${selected.id}`);
    toast({ type: "success", description: "Perintah disalin — tempel di chat" });
  }, [selected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        void uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 via-teal-500/5 to-transparent p-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
          <FolderLockIcon className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Berangkas Pribadi</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data?.security.algorithm ?? "AES-256-GCM"} ·{" "}
            {data?.security.storageLabel ?? "R2"} · metadata di Neon
            {data?.security.activeBackend === "r2" ? (
              <span className="ml-1 text-emerald-600">· R2 aktif</span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-background/60 px-4 py-2.5 backdrop-blur-sm">
          <ShieldCheckIcon className="size-4 text-emerald-500" />
          <div>
            <p className="text-xl font-bold tabular-nums leading-none">
              {data?.total ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">file aman</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            className="h-9 pl-8.5 text-sm"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, tag, ringkasan…"
            value={search}
          />
        </div>
        <Select onValueChange={setTypeFilter} value={typeFilter}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-36">
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

        {/* Upload drop zone button */}
        <button
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-all",
            isDragging
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-background hover:bg-muted"
          )}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          type="button"
        >
          {uploading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <UploadCloudIcon className="size-3.5" />
          )}
          {uploading ? "Mengunggah…" : "Upload"}
        </button>
        <input
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xlsx,.csv,.txt,.json,.zip"
          className="hidden"
          multiple
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          ref={fileRef}
          type="file"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* File List */}
        <div className="lg:col-span-2">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Memuat berangkas…
            </div>
          )}
          {!isLoading && filteredEmpty && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
              <SearchIcon className="mx-auto size-8 text-amber-500/70" />
              <p className="mt-3 text-sm font-medium">
                Filter aktif — tidak ada file yang cocok
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Kamu punya {total} file di berangkas. Reset pencarian atau tipe
                filter.
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Reset filter
              </Button>
            </div>
          )}
          {trulyEmpty && (
            <div
              className={cn(
                "rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
                isDragging
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border/40"
              )}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <UploadCloudIcon className="mx-auto size-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium">Berangkas kosong</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag & drop atau klik Upload di atas
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                atau ketik{" "}
                <span className="font-mono text-foreground/70">/v</span> lalu{" "}
                <span className="font-mono text-foreground/70">add</span> di
                chat
              </p>
            </div>
          )}

          <ul className="max-h-[min(32rem,65vh)] space-y-1.5 overflow-y-auto pr-1 no-scrollbar">
            <AnimatePresence>
              {files.map((file, index) => {
                const Icon = fileIcon(file.type);
                const colorClass =
                  typeColors[file.type] ?? "text-gray-500 bg-gray-500/10";
                const isSelected = selectedId === file.id;

                return (
                  <motion.li
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    initial={{ opacity: 0, x: -8 }}
                    key={file.id}
                    transition={{ delay: index * 0.03 }}
                  >
                    <button
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
                        isSelected
                          ? "border-primary/30 bg-primary/5 shadow-sm"
                          : "border-border/30 bg-card/20 hover:border-border/60 hover:bg-muted/30"
                      )}
                      onClick={() => selectFile(file)}
                      type="button"
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                          colorClass
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-snug">
                          {file.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          <span className="font-mono text-[10px] opacity-70">
                            {file.id.slice(0, 8)}…
                          </span>
                          {" · "}
                          {typeLabels[file.type] ?? file.type} ·{" "}
                          {formatBytes(file.size)}
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
                      {isSelected && (
                        <div className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>

        {/* Detail Panel */}
        <div className="min-h-[20rem] rounded-2xl border border-border/30 bg-card/10 lg:col-span-3">
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key="empty"
              >
                <FolderLockIcon className="size-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">
                  Pilih file untuk melihat detail, edit, atau membuka di chat.
                </p>
              </motion.div>
            ) : (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 p-4"
                exit={{ opacity: 0, y: 4 }}
                initial={{ opacity: 0, y: 8 }}
                key={selected.id}
                transition={{ duration: 0.25 }}
              >
                {/* File name + type badge */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-xl",
                      typeColors[selected.type] ?? "text-gray-500 bg-gray-500/10"
                    )}
                  >
                    {(() => {
                      const Icon = fileIcon(selected.type);
                      return <Icon className="size-5" />;
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    {isEditingName ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          autoFocus
                          className="h-8 text-sm font-medium"
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveMeta();
                            if (e.key === "Escape") {
                              setIsEditingName(false);
                              setEditName(selected.name);
                            }
                          }}
                          value={editName}
                        />
                        <button
                          className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-500/10"
                          onClick={() => void saveMeta()}
                          title="Simpan nama"
                          type="button"
                        >
                          <CheckIcon className="size-3.5" />
                        </button>
                        <button
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                          onClick={() => {
                            setIsEditingName(false);
                            setEditName(selected.name);
                          }}
                          title="Batal"
                          type="button"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="group flex items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">
                          {selected.name}
                        </h3>
                        <button
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                          onClick={() => {
                            setIsEditingName(true);
                            setEditName(selected.name);
                          }}
                          title="Ubah nama file"
                          type="button"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">
                        {typeLabels[selected.type] ?? selected.type}
                      </span>{" "}
                      · {formatBytes(selected.size)} ·{" "}
                      {new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(selected.createdAt))}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <VaultDownloadButton
                    className="h-8 flex-1 text-xs"
                    filename={selected.name}
                    label="Unduh"
                    url={`${apiBasePath()}/api/vault/${selected.id}/download`}
                    variant="default"
                  />
                  <Button
                    className="h-8 flex-1 text-xs"
                    onClick={openInChat}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <MessageSquareIcon className="size-3.5" />
                    Buka di Chat
                  </Button>
                  <Button
                    className="h-8 text-xs text-destructive hover:text-destructive"
                    onClick={() => void deleteFile()}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>

                {/* Metadata editor */}
                <div className="space-y-3 rounded-xl border border-border/30 bg-background/40 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Metadata
                  </p>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Ringkasan (konteks AI & nama tampilan jika belum diubah)
                    </Label>
                    <Textarea
                      className="min-h-[3.5rem] resize-none text-sm"
                      onChange={(e) => setEditSummary(e.target.value)}
                      placeholder="Contoh: Foto paspor, invoice Maret 2026…"
                      value={editSummary}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Tag (pisahkan dengan koma)
                    </Label>
                    <Input
                      className="text-sm"
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="dokumen, keuangan, pribadi"
                      value={editTags}
                    />
                  </div>

                  <Button
                    className="h-8 w-full text-xs"
                    disabled={savingMeta}
                    onClick={() => void saveMeta()}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {savingMeta ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <CheckIcon className="size-3.5" />
                    )}
                    Simpan perubahan
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground/60">
                  AI hanya melihat metadata di atas, bukan isi file.{" "}
                  Gunakan{" "}
                  <span className="font-mono text-foreground/50">
                    /share-to-ai {selected.id.slice(0, 8)}…
                  </span>{" "}
                  di chat untuk analisis isi.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Audit log */}
      {data?.audit && data.audit.length > 0 && (
        <section className="rounded-xl border border-border/25 bg-card/15 p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Aktivitas terbaru
          </h3>
          <ul className="max-h-36 space-y-1 overflow-y-auto no-scrollbar">
            {data.audit.map((row) => {
              const name =
                typeof row.detail?.fileName === "string"
                  ? row.detail.fileName
                  : null;
              return (
                <li
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground"
                  key={row.id}
                >
                  <span className="font-medium text-foreground">
                    {auditLabels[row.action] ?? row.action}
                  </span>
                  {name && <span className="truncate">{name}</span>}
                  <span className="text-[10px] opacity-60">
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
