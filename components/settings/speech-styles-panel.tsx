"use client";

import {
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createCustomSpeechStyle,
  exportSpeechStylesJson,
  parseImportedSpeechStyles,
  type SpeechStyle,
} from "@/lib/settings/speech-styles";
import type { PersonaSettings } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

type Props = {
  persona: PersonaSettings;
  onChange: (partial: Partial<PersonaSettings>) => void;
  onSave: (partial: Partial<PersonaSettings>) => void;
};

export function SpeechStylesPanel({ persona, onChange, onSave }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<SpeechStyle | null>(null);
  const [draft, setDraft] = useState<SpeechStyle | null>(null);

  const active = persona.styles.find((s) => s.id === persona.activeStyleId);
  const preview =
    active?.samplePhrase?.trim() ||
    "Baik, saya siap membantu dengan gaya yang kamu pilih.";

  const openCreate = () => {
    const style = createCustomSpeechStyle({
      name: "Gaya baru",
      description: "Gaya bicara kustom",
      instructions:
        "Tulis instruksi gaya di sini: nada, kata-kata, panjang jawaban, cara memanggil user, dll.",
      samplePhrase: "Contoh kalimat dengan gaya ini.",
    });
    setDraft(style);
    setEditing(style);
  };

  const openEdit = (style: SpeechStyle) => {
    setDraft({ ...style });
    setEditing(style);
  };

  const applyStyles = (styles: SpeechStyle[], activeStyleId?: string) => {
    onChange({
      styles,
      activeStyleId: activeStyleId ?? persona.activeStyleId,
    });
    onSave({ styles, activeStyleId: activeStyleId ?? persona.activeStyleId });
  };

  const saveDraft = () => {
    if (!draft) return;
    const exists = persona.styles.some((s) => s.id === draft.id);
    const styles = exists
      ? persona.styles.map((s) => (s.id === draft.id ? draft : s))
      : [...persona.styles, draft].slice(0, 24);
    applyStyles(styles, draft.id);
    setEditing(null);
    setDraft(null);
    toast.success("Gaya bicara disimpan");
  };

  const deleteStyle = (id: string) => {
    const styles = persona.styles.filter((s) => s.id !== id);
    const activeStyleId =
      persona.activeStyleId === id ? (styles[0]?.id ?? "") : persona.activeStyleId;
    applyStyles(styles, activeStyleId);
    toast.success("Gaya dihapus");
  };

  const duplicateStyle = (style: SpeechStyle) => {
    const copy = createCustomSpeechStyle({
      name: `${style.name} (salinan)`,
      description: style.description,
      instructions: style.instructions,
      samplePhrase: style.samplePhrase,
    });
    applyStyles([...persona.styles, copy].slice(0, 24), copy.id);
    toast.success("Gaya diduplikasi");
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseImportedSpeechStyles(JSON.parse(text));
      if (parsed.length === 0) {
        toast.error("Format file tidak valid");
        return;
      }
      const merged = [...persona.styles, ...parsed].slice(0, 24);
      applyStyles(merged, parsed[0].id);
      toast.success(`${parsed.length} gaya di-import`);
    } catch {
      toast.error("Gagal membaca file JSON");
    }
  };

  const exportCustom = () => {
    const blob = new Blob([exportSpeechStylesJson(persona.styles)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vandor-gaya-bicara.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card/40 to-violet-500/10 p-4">
        <p className="text-xs font-medium text-muted-foreground">
          Pratinjau gaya aktif
          {active ? ` · ${active.name}` : ""}
        </p>
        <p className="mt-2 rounded-lg border border-border/30 bg-background/60 px-3 py-2 text-sm italic text-muted-foreground">
          &ldquo;{preview}&rdquo;
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={openCreate} size="sm" type="button">
          <PlusIcon className="size-3.5" />
          Buat gaya
        </Button>
        <Button
          onClick={() => fileRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          <UploadIcon className="size-3.5" />
          Import JSON
        </Button>
        <Button
          onClick={exportCustom}
          size="sm"
          type="button"
          variant="outline"
        >
          <DownloadIcon className="size-3.5" />
          Export
        </Button>
        <input
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
          ref={fileRef}
          type="file"
        />
      </div>

      {persona.styles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          Belum ada gaya bicara. Klik <strong>Buat gaya</strong> atau{" "}
          <strong>Import JSON</strong> untuk mulai.
        </p>
      ) : (
      <div className="grid gap-2 sm:grid-cols-2">
        {persona.styles.map((style) => {
          const isActive = persona.activeStyleId === style.id;
          return (
            <div
              className={cn(
                "rounded-xl border p-3 transition-all",
                isActive
                  ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                  : "border-border/40 bg-card/30 hover:border-primary/25"
              )}
              key={style.id}
            >
              <button
                className="w-full text-left"
                onClick={() => {
                  onChange({ activeStyleId: style.id });
                  onSave({ activeStyleId: style.id });
                }}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{style.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {style.description || style.instructions.slice(0, 80)}
                    </p>
                  </div>
                  {isActive && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Aktif
                    </span>
                  )}
                </div>
              </button>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button
                  onClick={() => openEdit(style)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <PencilIcon className="size-3" />
                </Button>
                <Button
                  onClick={() => duplicateStyle(style)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <CopyIcon className="size-3" />
                </Button>
                <Button
                  onClick={() => deleteStyle(style.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="size-3 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {editing && draft && (
        <section className="space-y-3 rounded-xl border border-primary/30 bg-card/50 p-4">
          <h3 className="text-sm font-semibold">
            {persona.styles.some((s) => s.id === draft.id)
              ? "Edit gaya"
              : "Gaya baru"}
          </h3>
          <Input
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Nama gaya"
            value={draft.name}
          />
          <Input
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
            placeholder="Deskripsi singkat"
            value={draft.description}
          />
          <Textarea
            className="min-h-[140px] text-sm"
            onChange={(e) =>
              setDraft({ ...draft, instructions: e.target.value })
            }
            placeholder="Instruksi gaya bicara lengkap untuk AI…"
            value={draft.instructions}
          />
          <Input
            onChange={(e) =>
              setDraft({ ...draft, samplePhrase: e.target.value })
            }
            placeholder="Contoh kalimat (pratinjau)"
            value={draft.samplePhrase}
          />
          <div className="flex gap-2">
            <Button onClick={saveDraft} size="sm" type="button">
              Simpan
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Batal
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
