"use client";

import {
  ArrowLeftIcon,
  BrainIcon,
  CircleHelpIcon,
  EyeIcon,
  EyeOffIcon,
  FolderLockIcon,
  Loader2Icon,
  MessageCircleIcon,
  ServerIcon,
  ShieldIcon,
  SmartphoneIcon,
  SparklesIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { SpeechStylesPanel } from "@/components/settings/speech-styles-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ModelTierId, normalizeModelTier } from "@/lib/ai/model-tiers";
import { getTierUi } from "@/lib/ai/tier-styles";
import {
  personaLanguageLabels,
  personaVerbosityLabels,
} from "@/lib/settings/persona-presets";
import { resolveActiveSpeechStyle } from "@/lib/settings/speech-styles";
import type {
  IntegrationsSettings,
  PersonaSettings,
} from "@/lib/settings/types";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { ActivityPanel } from "./activity-panel";
import { AgentSkillsPanel } from "./agent-skills-panel";
import { HelpGuidePanel } from "./help-guide-panel";
import { LoginHistoryPanel } from "./login-history-panel";
import { ModelAiPanel } from "./model-ai-panel";
import { VaultPanel } from "./vault-panel";
import { WhatsappPanel } from "./whatsapp-panel";
import { SettingSlider } from "./setting-row";

import { apiBasePath } from "@/lib/app-url";
const base = apiBasePath;

type SecretSource = "database" | "env" | "none";

type SecretsPublicView = {
  openrouter: {
    configured: boolean;
    masked: string | null;
    source: SecretSource;
  };
  tavily: {
    configured: boolean;
    masked: string | null;
    source: SecretSource;
  };
  pin: { configured: boolean; source: SecretSource };
};

type GeneralPayload = {
  secrets: SecretsPublicView;
  settings: {
    persona: PersonaSettings;
    integrations: IntegrationsSettings;
  };
  gate: { ttlSeconds: number };
  envRequired: {
    postgres: boolean;
    authSecret: boolean;
    ownerEmail: boolean;
  };
  defaultModelTier: ModelTierId;
};

const tabs = [
  { id: "persona", label: "Gaya bicara", icon: MessageCircleIcon },
  { id: "model", label: "Model & AI", icon: SparklesIcon },
  { id: "skills", label: "Agent Skills", icon: WrenchIcon },
  { id: "vault", label: "Berangkas", icon: FolderLockIcon },
  { id: "whatsapp", label: "WhatsApp", icon: SmartphoneIcon },
  { id: "api", label: "API & integrasi", icon: ServerIcon },
  { id: "security", label: "Keamanan", icon: ShieldIcon },
  { id: "activity", label: "Log", icon: TerminalIcon },
  { id: "guide", label: "Panduan", icon: CircleHelpIcon },
] as const;

type TabId = (typeof tabs)[number]["id"];

async function fetchGeneral(): Promise<GeneralPayload> {
  const res = await fetch(`${base()}/api/settings/general`);
  if (!res.ok) {
    throw new Error("Gagal memuat pengaturan");
  }
  return res.json();
}

function SourceBadge({ source }: { source: SecretSource }) {
  const label =
    source === "database"
      ? "Database · terenkripsi"
      : source === "env"
        ? "File .env"
        : "Belum diatur";
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

export function GeneralSettingsPage() {
  const { data, mutate, isLoading } = useSWR(
    "user-settings-general",
    fetchGeneral
  );
  const [tab, setTab] = useState<TabId>("persona");
  const [saving, setSaving] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [showOr, setShowOr] = useState(false);
  const [showTavily, setShowTavily] = useState(false);

  const saveSecrets = useCallback(
    async (body: Record<string, unknown>) => {
      if (currentPin?.length !== 4) {
        toast({
          type: "error",
          description: "Masukkan PIN saat ini di tab Keamanan atau API",
        });
        return;
      }
      setSaving(true);
      try {
        const res = await fetch(`${base()}/api/settings/general`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPin, ...body }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof json.error === "string" ? json.error : "Gagal menyimpan"
          );
        }
        mutate(
          {
            ...data!,
            secrets: json.secrets,
            settings: json.settings ?? data!.settings,
          },
          false
        );
        setOpenrouterKey("");
        setTavilyKey("");
        setNewPin("");
        toast({ type: "success", description: json.message ?? "Disimpan" });
      } catch (e) {
        toast({
          type: "error",
          description: e instanceof Error ? e.message : "Gagal menyimpan",
        });
      } finally {
        setSaving(false);
      }
    },
    [currentPin, data, mutate]
  );

  const savePersona = useCallback(
    async (partial: {
      persona?: Partial<PersonaSettings>;
      integrations?: Partial<IntegrationsSettings>;
    }) => {
      setSaving(true);
      try {
        const res = await fetch(`${base()}/api/settings/general`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(partial),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error("Gagal menyimpan");
        }
        mutate({ ...data!, settings: json.settings }, false);
        toast({ type: "success", description: json.message ?? "Disimpan" });
      } catch {
        toast({ type: "error", description: "Gagal menyimpan gaya bicara" });
      } finally {
        setSaving(false);
      }
    },
    [data, mutate]
  );

  const patchPersona = useCallback(
    (partial: Partial<PersonaSettings>) => {
      if (!data) {
        return;
      }
      const next = { ...data.settings.persona, ...partial };
      mutate(
        {
          ...data,
          settings: { ...data.settings, persona: next },
        },
        false
      );
      void savePersona({ persona: partial });
    },
    [data, mutate, savePersona]
  );

  const patchIntegrations = useCallback(
    (partial: Partial<IntegrationsSettings>) => {
      if (!data) {
        return;
      }
      const next = { ...data.settings.integrations, ...partial };
      mutate(
        {
          ...data,
          settings: { ...data.settings, integrations: next },
        },
        false
      );
      void savePersona({ integrations: partial });
    },
    [data, mutate, savePersona]
  );

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { secrets, settings, gate, envRequired } = data;
  const p = settings.persona;
  const int = settings.integrations;
  const activeStyle = resolveActiveSpeechStyle(p);
  const preview =
    activeStyle.samplePhrase?.trim() || "Halo! Saya siap membantu.";

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
          <h1 className="text-lg font-semibold tracking-tight">Pengaturan</h1>
          <p className="text-xs text-muted-foreground">
            Model AI, gaya bicara, API keys, dan keamanan · {APP_NAME}{" "}
            <span className="font-mono text-[10px]">v{APP_VERSION}</span>
          </p>
        </div>
        <Button asChild size="sm" type="button" variant="outline">
          <Link href={`${base()}/settings/memory`}>
            <BrainIcon className="size-3.5" />
            Memori
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
            const tierUi =
              t.id === "model"
                ? getTierUi(normalizeModelTier(int.modelTier))
                : null;
            return (
              <button
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  tab === t.id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                key={t.id}
                onClick={() => setTab(t.id)}
                type="button"
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{t.label}</span>
                {tierUi ? (
                  <span
                    className={cn(
                      "rounded px-1.5 py-px text-[9px] font-semibold uppercase",
                      tierUi.chip
                    )}
                  >
                    {tierUi.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-2xl space-y-5">
            {tab === "persona" && (
              <>
                <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card/40 to-violet-500/10 p-4 sm:p-5">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/15 blur-3xl"
                  />
                  <div className="relative flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                      <SparklesIcon className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold">
                        Kepribadian {p.assistantName || "VANDOR"}
                      </h2>
                      <p className="mt-2 rounded-lg border border-border/30 bg-background/60 px-3 py-2 text-sm italic text-muted-foreground">
                        &ldquo;{preview}&rdquo;
                      </p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
                  <h2 className="text-sm font-semibold">Nama asisten</h2>
                  <Input
                    maxLength={32}
                    onBlur={() =>
                      savePersona({
                        persona: { assistantName: p.assistantName },
                      })
                    }
                    onChange={(e) =>
                      mutate(
                        {
                          ...data,
                          settings: {
                            ...data.settings,
                            persona: { ...p, assistantName: e.target.value },
                          },
                        },
                        false
                      )
                    }
                    placeholder="VANDOR"
                    value={p.assistantName}
                  />
                </section>

                <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
                  <h2 className="text-sm font-semibold">Gaya bicara kustom</h2>
                  <p className="text-xs text-muted-foreground">
                    Buat atau import JSON gaya bicara sendiri. Pilih gaya aktif
                    — VANDOR mengikutinya di setiap chat.
                  </p>
                  <SpeechStylesPanel
                    onChange={(partial) =>
                      mutate(
                        {
                          ...data,
                          settings: {
                            ...data.settings,
                            persona: { ...p, ...partial },
                          },
                        },
                        false
                      )
                    }
                    onSave={(partial) => savePersona({ persona: partial })}
                    persona={p}
                  />
                </section>

                <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
                  <h2 className="text-sm font-semibold">Bahasa</h2>
                  <div className="flex flex-wrap gap-2">
                    {(
                      Object.keys(personaLanguageLabels) as Array<
                        keyof typeof personaLanguageLabels
                      >
                    ).map((lang) => (
                      <Button
                        key={lang}
                        onClick={() => patchPersona({ language: lang })}
                        size="sm"
                        type="button"
                        variant={p.language === lang ? "default" : "outline"}
                      >
                        {personaLanguageLabels[lang]}
                      </Button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
                  <h2 className="text-sm font-semibold">Panjang jawaban</h2>
                  <div className="flex flex-wrap gap-2">
                    {(
                      Object.keys(personaVerbosityLabels) as Array<
                        keyof typeof personaVerbosityLabels
                      >
                    ).map((v) => (
                      <Button
                        key={v}
                        onClick={() => patchPersona({ verbosity: v })}
                        size="sm"
                        type="button"
                        variant={p.verbosity === v ? "default" : "outline"}
                      >
                        {personaVerbosityLabels[v]}
                      </Button>
                    ))}
                  </div>
                  <SettingSlider
                    description="Seberapa hangat dan personal nada bicara."
                    id="warmth"
                    label="Kehangatan"
                    max={100}
                    min={0}
                    onChange={(warmth) => patchPersona({ warmth })}
                    value={p.warmth}
                  />
                  <SettingSlider
                    description="Seberapa formal pilihan kata."
                    id="formality"
                    label="Formalitas"
                    max={100}
                    min={0}
                    onChange={(formality) => patchPersona({ formality })}
                    value={p.formality}
                  />
                </section>

                <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
                  <h2 className="text-sm font-semibold">Instruksi kustom</h2>
                  <p className="text-xs text-muted-foreground">
                    Aturan tambahan untuk gaya bicara (mis. selalu panggil
                    &quot;Boss&quot;, hindari emoji, fokus bisnis).
                  </p>
                  <Textarea
                    className="min-h-[100px] resize-y text-sm"
                    maxLength={2500}
                    onBlur={() =>
                      savePersona({
                        persona: { customInstructions: p.customInstructions },
                      })
                    }
                    onChange={(e) =>
                      mutate(
                        {
                          ...data,
                          settings: {
                            ...data.settings,
                            persona: {
                              ...p,
                              customInstructions: e.target.value,
                            },
                          },
                        },
                        false
                      )
                    }
                    placeholder="Contoh: Selalu gunakan Bahasa Indonesia santun. Panggil saya Boss."
                    value={p.customInstructions}
                  />
                  <label className="block text-xs font-medium" htmlFor="sig">
                    Frasa khas (opsional)
                  </label>
                  <Input
                    id="sig"
                    maxLength={120}
                    onBlur={() =>
                      savePersona({
                        persona: { signaturePhrase: p.signaturePhrase },
                      })
                    }
                    onChange={(e) =>
                      mutate(
                        {
                          ...data,
                          settings: {
                            ...data.settings,
                            persona: {
                              ...p,
                              signaturePhrase: e.target.value,
                            },
                          },
                        },
                        false
                      )
                    }
                    placeholder="Siap, Boss."
                    value={p.signaturePhrase}
                  />
                </section>
              </>
            )}

            {tab === "model" && (
              <ModelAiPanel
                modelTier={normalizeModelTier(int.modelTier)}
                onOpenApiTab={() => setTab("api")}
                onTierChange={(tier) => patchIntegrations({ modelTier: tier })}
                saving={saving}
              />
            )}

            {tab === "skills" && <AgentSkillsPanel />}

            {tab === "api" && (
              <>
                <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Yang tetap di .env (server)
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    <li>
                      <code>POSTGRES_URL</code> — database Neon{" "}
                      {envRequired.postgres ? "✓" : "✗"}
                    </li>
                    <li>
                      <code>AUTH_SECRET</code> — enkripsi key di DB{" "}
                      {envRequired.authSecret ? "✓" : "✗"}
                    </li>
                    <li>
                      <code>VANDOR_OWNER_EMAIL</code> — login owner{" "}
                      {envRequired.ownerEmail ? "✓" : "✗"}
                    </li>
                  </ul>
                  <p className="mt-2">
                    OpenRouter, Tavily, PIN, model, dan gaya bicara bisa dari
                    UI.
                  </p>
                </section>

                <ApiKeySection
                  configured={secrets.openrouter}
                  description="Chat, embedding memori, polish, gambar."
                  label="OpenRouter"
                  onChange={setOpenrouterKey}
                  onClear={() => saveSecrets({ clearOpenrouter: true })}
                  onSave={() =>
                    saveSecrets({ openrouterApiKey: openrouterKey })
                  }
                  placeholder="sk-or-v1-…"
                  show={showOr}
                  toggleShow={() => setShowOr((v) => !v)}
                  value={openrouterKey}
                />

                <ApiKeySection
                  configured={secrets.tavily}
                  description="Pencarian web kaya (berita, gambar). Tanpa key: fallback DDG."
                  label="Tavily (web search)"
                  onChange={setTavilyKey}
                  onClear={() => saveSecrets({ clearTavily: true })}
                  onSave={() => saveSecrets({ tavilyApiKey: tavilyKey })}
                  placeholder="tvly-…"
                  show={showTavily}
                  toggleShow={() => setShowTavily((v) => !v)}
                  value={tavilyKey}
                />

                <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
                  <h2 className="text-sm font-semibold">Header OpenRouter</h2>
                  <p className="text-xs text-muted-foreground">
                    Tier model di tab Model & AI. Di sini hanya nama app untuk
                    analytics OpenRouter.
                  </p>
                  <label className="block text-xs font-medium" htmlFor="appn">
                    Nama app (header OpenRouter)
                  </label>
                  <Input
                    id="appn"
                    onBlur={() =>
                      patchIntegrations({
                        openrouterAppName: int.openrouterAppName,
                      })
                    }
                    onChange={(e) =>
                      mutate(
                        {
                          ...data,
                          settings: {
                            ...data.settings,
                            integrations: {
                              ...int,
                              openrouterAppName: e.target.value,
                            },
                          },
                        },
                        false
                      )
                    }
                    value={int.openrouterAppName}
                  />
                  <label className="block text-xs font-medium" htmlFor="appu">
                    URL app (HTTP-Referer)
                  </label>
                  <Input
                    id="appu"
                    onBlur={() =>
                      patchIntegrations({
                        openrouterAppUrl: int.openrouterAppUrl,
                      })
                    }
                    onChange={(e) =>
                      mutate(
                        {
                          ...data,
                          settings: {
                            ...data.settings,
                            integrations: {
                              ...int,
                              openrouterAppUrl: e.target.value,
                            },
                          },
                        },
                        false
                      )
                    }
                    placeholder="https://…"
                    value={int.openrouterAppUrl}
                  />
                </section>
              </>
            )}

            {tab === "vault" && <VaultPanel />}

            {tab === "whatsapp" && <WhatsappPanel />}

            {tab === "activity" && <ActivityPanel />}

            {tab === "guide" && <HelpGuidePanel />}

            {tab === "security" && (
              <>
                <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldIcon className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">PIN numpad</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sesi login: {Math.round(gate.ttlSeconds / 86_400)} hari ·
                    Sumber: <SourceBadge source={secrets.pin.source} />
                    {secrets.pin.source === "database" && (
                      <>
                        {" "}
                        · PIN dari .env tidak dipakai lagi setelah disimpan di
                        sini
                      </>
                    )}
                  </p>
                  <label
                    className="block text-xs font-medium"
                    htmlFor="cur-pin"
                  >
                    PIN saat ini (wajib untuk simpan API)
                  </label>
                  <Input
                    autoComplete="off"
                    className="max-w-[8rem] font-mono tracking-widest"
                    id="cur-pin"
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) =>
                      setCurrentPin(
                        e.target.value.replace(/\D/g, "").slice(0, 4)
                      )
                    }
                    type="password"
                    value={currentPin}
                  />
                  <label
                    className="block text-xs font-medium"
                    htmlFor="new-pin"
                  >
                    PIN baru
                  </label>
                  <Input
                    autoComplete="new-password"
                    className="max-w-[8rem] font-mono tracking-widest"
                    id="new-pin"
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) =>
                      setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    type="password"
                    value={newPin}
                  />
                  <Button
                    disabled={newPin.length !== 4 || saving}
                    onClick={() => saveSecrets({ newPin })}
                    size="sm"
                    type="button"
                  >
                    Simpan PIN baru
                  </Button>
                </section>
                <LoginHistoryPanel />
                <p className="text-[11px] text-muted-foreground">
                  API key dienkripsi AES-256-GCM dengan{" "}
                  <code className="rounded bg-muted px-1">AUTH_SECRET</code>.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiKeySection({
  label,
  description,
  configured,
  value,
  onChange,
  placeholder,
  show,
  toggleShow,
  onSave,
  onClear,
}: {
  label: string;
  description: string;
  configured: SecretsPublicView["openrouter"];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  toggleShow: () => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
      <h2 className="text-sm font-semibold">{label}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
      {configured.masked && (
        <p className="font-mono text-xs text-muted-foreground">
          Aktif: {configured.masked} <SourceBadge source={configured.source} />
        </p>
      )}
      <div className="relative">
        <Input
          autoComplete="off"
          className="pr-10 font-mono text-sm"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={show ? "text" : "password"}
          value={value}
        />
        <Button
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
          onClick={toggleShow}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {show ? (
            <EyeOffIcon className="size-3.5" />
          ) : (
            <EyeIcon className="size-3.5" />
          )}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={value.length < 8}
          onClick={onSave}
          size="sm"
          type="button"
        >
          Simpan
        </Button>
        {configured.source === "database" && (
          <Button onClick={onClear} size="sm" type="button" variant="outline">
            Hapus dari database
          </Button>
        )}
      </div>
    </section>
  );
}
