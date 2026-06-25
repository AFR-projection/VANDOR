"use client";

import {
  ArrowLeftIcon,
  BrainIcon,
  CpuIcon,
  ImageIcon,
  Loader2Icon,
  SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { type MemoryCategory, memoryCategories } from "@/lib/db/schema";
import type { UserSettings } from "@/lib/settings/types";
import { MemoryBrainHero } from "./memory-brain-hero";
import { MemoryManager } from "./memory-manager";
import { SettingSlider, SettingToggle } from "./setting-row";
import { TokenUsagePanel } from "./token-usage-panel";

import { apiBasePath } from "@/lib/app-url";
const base = apiBasePath;

type SettingsPayload = {
  settings: UserSettings;
  env: {
    embeddingModel: string;
    postgresConfigured: boolean;
    openrouterConfigured: boolean;
  };
};

async function fetchSettings(): Promise<SettingsPayload> {
  const res = await fetch(`${base()}/api/settings/memory`);
  if (!res.ok) {
    throw new Error("Gagal memuat pengaturan");
  }
  return res.json();
}

const tabs = [
  { id: "memory", label: "Memori", icon: BrainIcon },
  { id: "visual", label: "Visual Memory", icon: ImageIcon },
  { id: "advanced", label: "Lanjutan", icon: CpuIcon },
  { id: "manage", label: "Kelola Memori", icon: BrainIcon },
] as const;

type TabId = (typeof tabs)[number]["id"];

const categoryLabels: Record<MemoryCategory, string> = {
  fact: "Fakta",
  preference: "Preferensi",
  goal: "Tujuan",
  person: "Orang",
  event: "Peristiwa",
  instruction: "Instruksi",
};

export function MemorySettingsPage() {
  const { data, mutate, isLoading } = useSWR(
    "user-settings-memory",
    fetchSettings
  );
  const [tab, setTab] = useState<TabId>("memory");
  const [saving, setSaving] = useState(false);

  const patch = useCallback(
    async (partial: Partial<UserSettings>) => {
      if (!data) {
        return;
      }
      setSaving(true);
      try {
        const res = await fetch(`${base()}/api/settings/memory`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        if (!res.ok) {
          throw new Error("Save failed");
        }
        const json = await res.json();
        mutate({ ...data, settings: json.settings }, false);
        toast({ type: "success", description: "Pengaturan disimpan" });
      } catch {
        toast({ type: "error", description: "Gagal menyimpan pengaturan" });
      } finally {
        setSaving(false);
      }
    },
    [data, mutate]
  );

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { settings, env } = data;
  const m = settings.memory;
  const v = settings.visualMemory;
  const a = settings.advanced;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3 sm:px-6">
        <Button asChild size="icon-sm" type="button" variant="ghost">
          <Link href="/">
            <ArrowLeftIcon className="size-4" />
            <span className="sr-only">Kembali ke chat</span>
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Pengaturan Memori
          </h1>
          <p className="text-xs text-muted-foreground">
            Database ingatan, visual memory, retrieval, dan kelola memori
          </p>
        </div>
        <Button asChild size="sm" type="button" variant="outline">
          <Link href={`${base()}/settings`}>
            <SettingsIcon className="size-3.5" />
            Pengaturan
          </Link>
        </Button>
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            Menyimpan…
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/40 p-2 md:w-52 md:flex-col md:border-b-0 md:border-r md:p-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  tab === t.id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                key={t.id}
                onClick={() => setTab(t.id)}
                type="button"
              >
                <Icon className="size-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-2xl space-y-4">
            <MemoryBrainHero
              memoryEnabled={m.enabled}
              visualEnabled={v.enabled}
            />
            {tab === "memory" && (
              <>
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold">
                    Memori jangka panjang
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Model embedding:{" "}
                    <code className="rounded bg-muted px-1">
                      {env.embeddingModel}
                    </code>
                    {!env.postgresConfigured && (
                      <span className="text-destructive">
                        {" "}
                        · Postgres tidak terkonfigurasi
                      </span>
                    )}
                  </p>
                  <SettingToggle
                    checked={m.enabled}
                    description="Nonaktifkan untuk tidak menyimpan atau mengingat memori sama sekali."
                    id="memory-enabled"
                    label="Aktifkan memori"
                    onCheckedChange={(enabled) =>
                      patch({ memory: { ...m, enabled } })
                    }
                  />
                  <SettingToggle
                    checked={m.autoExtract}
                    description="Otomatis mengekstrak fakta dari percakapan setelah setiap balasan."
                    id="memory-auto"
                    label="Ekstraksi otomatis"
                    onCheckedChange={(autoExtract) =>
                      patch({ memory: { ...m, autoExtract } })
                    }
                  />
                  <SettingToggle
                    checked={m.preExtractFromUser !== false}
                    description="Ambil fakta dari pesan user sebelum jawaban (paralel). Wajib tunggu jika kamu bilang “ingat”."
                    id="memory-pre"
                    label="Pre-extract (Memory v2)"
                    onCheckedChange={(preExtractFromUser) =>
                      patch({ memory: { ...m, preExtractFromUser } })
                    }
                  />
                  <SettingToggle
                    checked={m.mergeSimilarMemories !== false}
                    description="Gabungkan atau perbarui memori mirip, bukan duplikat."
                    id="memory-merge"
                    label="Gabung memori serupa"
                    onCheckedChange={(mergeSimilarMemories) =>
                      patch({ memory: { ...m, mergeSimilarMemories } })
                    }
                  />
                  <SettingToggle
                    checked={m.autoHygiene !== false}
                    description="Setelah ekstraksi: gabung duplikat, turunkan memori usang, dan rapikan otomatis."
                    id="memory-hygiene"
                    label="Perawatan memori otomatis"
                    onCheckedChange={(autoHygiene) =>
                      patch({ memory: { ...m, autoHygiene } })
                    }
                  />
                  <SettingToggle
                    checked={m.injectInPrompt}
                    description="Sisipkan memori relevan ke konteks AI sebelum menjawab."
                    id="memory-inject"
                    label="Gunakan memori saat menjawab"
                    onCheckedChange={(injectInPrompt) =>
                      patch({ memory: { ...m, injectInPrompt } })
                    }
                  />
                </section>

                <section className="space-y-3">
                  <h2 className="text-sm font-semibold">Retrieval</h2>
                  <SettingSlider
                    description="Jumlah hasil pencarian semantik per pertanyaan."
                    id="semantic-limit"
                    label="Batas pencarian semantik"
                    max={24}
                    min={1}
                    onChange={(semanticSearchLimit) =>
                      patch({ memory: { ...m, semanticSearchLimit } })
                    }
                    value={m.semanticSearchLimit}
                  />
                  <SettingSlider
                    description="Memori terbaru yang selalu dipertimbangkan."
                    id="recent-limit"
                    label="Memori terbaru"
                    max={24}
                    min={0}
                    onChange={(recentMemoriesLimit) =>
                      patch({ memory: { ...m, recentMemoriesLimit } })
                    }
                    value={m.recentMemoriesLimit}
                  />
                  <SettingSlider
                    description="Ambang kemiripan vektor (lebih tinggi = lebih ketat)."
                    id="min-sim"
                    label="Min. similarity"
                    max={0.95}
                    min={0.4}
                    onChange={(minSimilarity) =>
                      patch({ memory: { ...m, minSimilarity } })
                    }
                    step={0.01}
                    value={m.minSimilarity}
                  />
                  <SettingSlider
                    description="Maksimum memori baru per giliran chat."
                    id="max-extract"
                    label="Ekstraksi per balasan"
                    max={5}
                    min={0}
                    onChange={(maxExtractPerTurn) =>
                      patch({ memory: { ...m, maxExtractPerTurn } })
                    }
                    value={m.maxExtractPerTurn}
                  />
                </section>

                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">Kategori aktif</h2>
                  {memoryCategories.map((cat) => (
                    <SettingToggle
                      checked={m.enabledCategories[cat]}
                      id={`cat-${cat}`}
                      key={cat}
                      label={categoryLabels[cat]}
                      onCheckedChange={(on) =>
                        patch({
                          memory: {
                            ...m,
                            enabledCategories: {
                              ...m.enabledCategories,
                              [cat]: on,
                            },
                          },
                        })
                      }
                    />
                  ))}
                </section>
              </>
            )}

            {tab === "visual" && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Visual Memory</h2>
                <p className="text-xs text-muted-foreground">
                  Menyimpan konteks saat kamu mengunggah gambar di chat (nama
                  file + pesan kamu). Berguna untuk mengingat referensi visual.
                </p>
                <SettingToggle
                  checked={v.enabled}
                  id="visual-enabled"
                  label="Aktifkan visual memory"
                  onCheckedChange={(enabled) =>
                    patch({ visualMemory: { ...v, enabled } })
                  }
                />
                <SettingToggle
                  checked={v.autoCaptureFromImages}
                  description="Simpan otomatis setelah kamu kirim pesan dengan lampiran gambar."
                  id="visual-auto"
                  label="Tangkap otomatis dari upload"
                  onCheckedChange={(autoCaptureFromImages) =>
                    patch({ visualMemory: { ...v, autoCaptureFromImages } })
                  }
                />
                <SettingToggle
                  checked={v.includeInRecall}
                  description="Sertakan memori visual saat AI mencari memori relevan."
                  id="visual-recall"
                  label="Gunakan saat recall"
                  onCheckedChange={(includeInRecall) =>
                    patch({ visualMemory: { ...v, includeInRecall } })
                  }
                />
                <SettingSlider
                  description="Batas maksimum entri visual yang disimpan."
                  id="visual-max"
                  label="Maks. memori visual"
                  max={100}
                  min={5}
                  onChange={(maxVisualMemories) =>
                    patch({ visualMemory: { ...v, maxVisualMemories } })
                  }
                  value={v.maxVisualMemories}
                />
              </section>
            )}

            {tab === "advanced" && (
              <section className="space-y-3">
                <TokenUsagePanel />
                <h2 className="text-sm font-semibold">Pengaturan lanjutan</h2>
                <p className="text-xs text-muted-foreground">
                  Postgres:{" "}
                  {env.postgresConfigured ? "terhubung" : "tidak dikonfigurasi"}{" "}
                  · OpenRouter: {env.openrouterConfigured ? "OK" : "tidak ada"}{" "}
                  · API key di menu{" "}
                  <Link className="underline" href={`${base()}/settings`}>
                    Pengaturan
                  </Link>
                </p>
                <SettingToggle
                  checked={a.webSearchAuto}
                  description="Deteksi otomatis kapan perlu mencari web (berita, harga, dll.)."
                  id="web-auto"
                  label="Web search otomatis"
                  onCheckedChange={(webSearchAuto) =>
                    patch({ advanced: { ...a, webSearchAuto } })
                  }
                />
                <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-3">
                  <p className="mb-2 text-sm font-medium">
                    Tingkat rich content
                  </p>
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Kontrol kartu, galeri, dan pertanyaan lanjutan di jawaban.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["minimal", "Minimal — hanya teks"],
                        ["auto", "Otomatis (disarankan)"],
                        ["rich", "Sama dengan auto saat search"],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        onClick={() =>
                          patch({
                            advanced: {
                              ...a,
                              richContentLevel: value,
                            },
                          })
                        }
                        size="sm"
                        type="button"
                        variant={
                          a.richContentLevel === value ? "default" : "outline"
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <SettingToggle
                  checked={a.responsePolish}
                  description="Perhalus gaya bahasa jawaban setelah streaming selesai."
                  id="polish"
                  label="Response polish"
                  onCheckedChange={(responsePolish) =>
                    patch({ advanced: { ...a, responsePolish } })
                  }
                />
                <SettingToggle
                  checked={a.responseCache}
                  description="Cache jawaban untuk pertanyaan sederhana yang berulang."
                  id="cache"
                  label="Response cache"
                  onCheckedChange={(responseCache) =>
                    patch({ advanced: { ...a, responseCache } })
                  }
                />
                <SettingToggle
                  checked={a.conversationSummary}
                  description="Ringkas percakapan panjang untuk konteks memori."
                  id="summary"
                  label="Ringkasan percakapan"
                  onCheckedChange={(conversationSummary) =>
                    patch({ advanced: { ...a, conversationSummary } })
                  }
                />
                <SettingSlider
                  description="Setiap berapa pesan dibuat ringkasan."
                  id="summary-interval"
                  label="Interval ringkasan (pesan)"
                  max={50}
                  min={5}
                  onChange={(summaryInterval) =>
                    patch({ advanced: { ...a, summaryInterval } })
                  }
                  value={a.summaryInterval}
                />
              </section>
            )}

            {tab === "manage" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Semua ingatan VANDOR — edit, hapus, atau tambah manual.
                  Setelah chat, toast &quot;VANDOR mengingat…&quot; muncul jika
                  ada fakta baru tersimpan.
                </p>
                <MemoryManager />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
