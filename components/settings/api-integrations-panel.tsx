"use client";

import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IntegrationSecretKey } from "@/lib/settings/integration-secret-keys";
import type { IntegrationsSettings } from "@/lib/settings/types";
import type {
  SecretFieldView,
  SecretSource,
  SecretsPublicView,
} from "@/lib/settings/secrets-types";
import { cn } from "@/lib/utils";

function SourceBadge({ source }: { source: SecretSource }) {
  const label =
    source === "database"
      ? "Database (terenkripsi)"
      : source === "env"
        ? "File .env"
        : "Belum diatur";
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

function SecretKeyField({
  label,
  description,
  configured,
  value,
  onChange,
  placeholder,
  onSave,
  onClear,
  clearKey,
  minLength = 8,
}: {
  label: string;
  description: string;
  configured: SecretFieldView;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSave: () => void;
  onClear?: () => void;
  clearKey?: IntegrationSecretKey;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      {configured.masked && (
        <p className="font-mono text-[11px] text-muted-foreground">
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
          onClick={() => setShow((v) => !v)}
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
          disabled={value.length < minLength}
          onClick={onSave}
          size="sm"
          type="button"
        >
          Simpan
        </Button>
        {configured.source === "database" && onClear && clearKey && (
          <Button onClick={onClear} size="sm" type="button" variant="outline">
            Hapus dari database
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfigField({
  id,
  label,
  description,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      {description && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}
      <Input
        id={id}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

type ApiIntegrationsPanelProps = {
  secrets: SecretsPublicView;
  integrations: IntegrationsSettings;
  envRequired: {
    postgres: boolean;
    authSecret: boolean;
    ownerEmail: boolean;
  };
  currentPin: string;
  onPinChange: (pin: string) => void;
  draftSecrets: Record<IntegrationSecretKey | "openrouter" | "tavily", string>;
  onDraftChange: (
    key: IntegrationSecretKey | "openrouter" | "tavily",
    value: string
  ) => void;
  onSaveSecrets: (body: Record<string, unknown>) => void;
  onPatchIntegrations: (patch: Partial<IntegrationsSettings>) => void;
  onIntegrationsFieldChange: (patch: Partial<IntegrationsSettings>) => void;
};

export function ApiIntegrationsPanel({
  secrets,
  integrations,
  envRequired,
  currentPin,
  onPinChange,
  draftSecrets,
  onDraftChange,
  onSaveSecrets,
  onPatchIntegrations,
  onIntegrationsFieldChange,
}: ApiIntegrationsPanelProps) {
  const int = integrations;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">
          Yang tetap di .env (bootstrap server)
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <code>POSTGRES_URL</code> — database Neon{" "}
            {envRequired.postgres ? "✓" : "✗"}
          </li>
          <li>
            <code>AUTH_SECRET</code> — kunci enkripsi secret di DB{" "}
            {envRequired.authSecret ? "✓" : "✗"}
          </li>
          <li>
            <code>VANDOR_OWNER_EMAIL</code> / password — login owner{" "}
            {envRequired.ownerEmail ? "✓" : "✗"}
          </li>
        </ul>
        <p className="mt-2">
          Semua API key di bawah disimpan terenkripsi (AES-256-GCM) setelah PIN
          diverifikasi. Setelah disimpan di UI, nilai .env untuk key yang sama
          diabaikan.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
        <div className="flex items-center gap-2">
          <LockIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">PIN verifikasi</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Wajib diisi sebelum menyimpan API key (sama dengan tab Keamanan).
        </p>
        <Input
          autoComplete="off"
          className="max-w-[8rem] font-mono tracking-widest"
          inputMode="numeric"
          maxLength={4}
          onChange={(e) =>
            onPinChange(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          placeholder="••••"
          type="password"
          value={currentPin}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
          <h2 className="text-sm font-semibold">AI & pencarian</h2>
          <SecretKeyField
            configured={secrets.openrouter}
            description="Chat, embedding memori, polish, gambar."
            label="OpenRouter API key"
            onChange={(v) => onDraftChange("openrouter", v)}
            onClear={() => onSaveSecrets({ clearOpenrouter: true })}
            onSave={() =>
              onSaveSecrets({ openrouterApiKey: draftSecrets.openrouter })
            }
            placeholder="sk-or-v1-…"
            value={draftSecrets.openrouter}
          />
          <SecretKeyField
            configured={secrets.tavily}
            description="Pencarian web kaya. Tanpa key: fallback DuckDuckGo."
            label="Tavily API key"
            onChange={(v) => onDraftChange("tavily", v)}
            onClear={() => onSaveSecrets({ clearTavily: true })}
            onSave={() =>
              onSaveSecrets({ tavilyApiKey: draftSecrets.tavily })
            }
            placeholder="tvly-…"
            value={draftSecrets.tavily}
          />
          <ConfigField
            description="Model embedding untuk memori semantik (OpenRouter)."
            id="embed-model"
            label="Model embedding memori"
            onBlur={() =>
              onPatchIntegrations({
                memoryEmbeddingModel: int.memoryEmbeddingModel,
              })
            }
            onChange={(v) => onIntegrationsFieldChange({ memoryEmbeddingModel: v })}
            placeholder="openai/text-embedding-3-small"
            value={int.memoryEmbeddingModel}
          />
          <div className="space-y-2 border-t border-border/30 pt-3">
            <p className="text-xs font-medium">Header OpenRouter</p>
            <ConfigField
              id="appn"
              label="Nama app"
              onBlur={() =>
                onPatchIntegrations({ openrouterAppName: int.openrouterAppName })
              }
              onChange={(v) => onIntegrationsFieldChange({ openrouterAppName: v })}
              value={int.openrouterAppName}
            />
            <ConfigField
              id="appu"
              label="URL app (HTTP-Referer)"
              onBlur={() =>
                onPatchIntegrations({ openrouterAppUrl: int.openrouterAppUrl })
              }
              onChange={(v) => onIntegrationsFieldChange({ openrouterAppUrl: v })}
              placeholder="https://…"
              value={int.openrouterAppUrl}
            />
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Penyimpanan file</h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                secrets.storage.r2Configured
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              R2 {secrets.storage.r2Configured ? "aktif" : "belum"}
            </span>
          </div>
          <ConfigField
            description="Cloudflare dashboard → R2 → Account ID."
            id="r2-account"
            label="R2 Account ID"
            onBlur={() => onPatchIntegrations({ r2AccountId: int.r2AccountId })}
            onChange={(v) => onIntegrationsFieldChange({ r2AccountId: v })}
            placeholder="3d55e64e…"
            value={int.r2AccountId}
          />
          <ConfigField
            id="r2-bucket"
            label="R2 Bucket name"
            onBlur={() =>
              onPatchIntegrations({ r2BucketName: int.r2BucketName })
            }
            onChange={(v) => onIntegrationsFieldChange({ r2BucketName: v })}
            value={int.r2BucketName}
          />
          <ConfigField
            description="Domain publik r2.dev atau custom domain (opsional)."
            id="r2-public"
            label="R2 Public URL"
            onBlur={() => onPatchIntegrations({ r2PublicUrl: int.r2PublicUrl })}
            onChange={(v) => onIntegrationsFieldChange({ r2PublicUrl: v })}
            placeholder="https://pub-….r2.dev"
            value={int.r2PublicUrl}
          />
          <SecretKeyField
            clearKey="r2AccessKeyId"
            configured={secrets.r2AccessKeyId}
            description="R2 → Manage API tokens."
            label="R2 Access Key ID"
            minLength={4}
            onChange={(v) => onDraftChange("r2AccessKeyId", v)}
            onClear={() =>
              onSaveSecrets({ clearExtraSecrets: ["r2AccessKeyId"] })
            }
            onSave={() =>
              onSaveSecrets({
                extraSecrets: { r2AccessKeyId: draftSecrets.r2AccessKeyId },
              })
            }
            placeholder="875ab2d0…"
            value={draftSecrets.r2AccessKeyId}
          />
          <SecretKeyField
            clearKey="r2SecretAccessKey"
            configured={secrets.r2SecretAccessKey}
            description="Secret key pasangan access key di atas."
            label="R2 Secret Access Key"
            minLength={8}
            onChange={(v) => onDraftChange("r2SecretAccessKey", v)}
            onClear={() =>
              onSaveSecrets({ clearExtraSecrets: ["r2SecretAccessKey"] })
            }
            onSave={() =>
              onSaveSecrets({
                extraSecrets: {
                  r2SecretAccessKey: draftSecrets.r2SecretAccessKey,
                },
              })
            }
            placeholder="34af0336…"
            value={draftSecrets.r2SecretAccessKey}
          />
          <div className="border-t border-border/30 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium">Vercel Blob (alternatif)</p>
              <span className="text-[10px] text-muted-foreground">
                {secrets.storage.vercelBlobConfigured ? "aktif" : "opsional"}
              </span>
            </div>
            <SecretKeyField
              clearKey="blobReadWriteToken"
              configured={secrets.blobReadWriteToken}
              description="Token dari Vercel → Storage → Blob."
              label="BLOB_READ_WRITE_TOKEN"
              minLength={10}
              onChange={(v) => onDraftChange("blobReadWriteToken", v)}
              onClear={() =>
                onSaveSecrets({ clearExtraSecrets: ["blobReadWriteToken"] })
              }
              onSave={() =>
                onSaveSecrets({
                  extraSecrets: {
                    blobReadWriteToken: draftSecrets.blobReadWriteToken,
                  },
                })
              }
              placeholder="vercel_blob_…"
              value={draftSecrets.blobReadWriteToken}
            />
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Media download (Cobalt)</h2>
            <span className="text-[10px] text-muted-foreground">
              {secrets.storage.cobaltConfigured ? "backend OK" : "belum"}
            </span>
          </div>
          <ConfigField
            description="URL instance Cobalt sendiri (Railway/VPS). Kosong = api.cobalt.tools."
            id="cobalt-url"
            label="Cobalt API URL"
            onBlur={() => onPatchIntegrations({ cobaltApiUrl: int.cobaltApiUrl })}
            onChange={(v) => onIntegrationsFieldChange({ cobaltApiUrl: v })}
            placeholder="https://cobalt-api….railway.app"
            value={int.cobaltApiUrl}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              checked={int.cobaltAllowPublic}
              className="size-3.5 rounded border-border"
              onChange={(e) => {
                onIntegrationsFieldChange({ cobaltAllowPublic: e.target.checked });
                onPatchIntegrations({ cobaltAllowPublic: e.target.checked });
              }}
              type="checkbox"
            />
            Izinkan Cobalt publik (api.cobalt.tools) tanpa instance sendiri
          </label>
          <SecretKeyField
            clearKey="cobaltApiKey"
            configured={secrets.cobaltApiKey}
            description="Hanya jika instance Cobalt memakai auth API key."
            label="Cobalt API key"
            minLength={4}
            onChange={(v) => onDraftChange("cobaltApiKey", v)}
            onClear={() => onSaveSecrets({ clearExtraSecrets: ["cobaltApiKey"] })}
            onSave={() =>
              onSaveSecrets({
                extraSecrets: { cobaltApiKey: draftSecrets.cobaltApiKey },
              })
            }
            placeholder="Opsional"
            value={draftSecrets.cobaltApiKey}
          />
        </section>

        <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
          <h2 className="text-sm font-semibold">Cuaca & WhatsApp</h2>
          <SecretKeyField
            clearKey="openweathermapApiKey"
            configured={secrets.openweathermapApiKey}
            description="Layer peta cuaca & data OWM. Tanpa key: fallback Open-Meteo."
            label="OpenWeatherMap API key"
            minLength={8}
            onChange={(v) => onDraftChange("openweathermapApiKey", v)}
            onClear={() =>
              onSaveSecrets({ clearExtraSecrets: ["openweathermapApiKey"] })
            }
            onSave={() =>
              onSaveSecrets({
                extraSecrets: {
                  openweathermapApiKey: draftSecrets.openweathermapApiKey,
                },
              })
            }
            placeholder="owm key…"
            value={draftSecrets.openweathermapApiKey}
          />
          <SecretKeyField
            clearKey="whatsappBridgeSecret"
            configured={secrets.whatsappBridgeSecret}
            description="Bearer secret antara bridge Baileys dan endpoint ingest."
            label="WhatsApp bridge secret"
            minLength={8}
            onChange={(v) => onDraftChange("whatsappBridgeSecret", v)}
            onClear={() =>
              onSaveSecrets({ clearExtraSecrets: ["whatsappBridgeSecret"] })
            }
            onSave={() =>
              onSaveSecrets({
                extraSecrets: {
                  whatsappBridgeSecret: draftSecrets.whatsappBridgeSecret,
                },
              })
            }
            placeholder="min. 8 karakter"
            value={draftSecrets.whatsappBridgeSecret}
          />
          <ConfigField
            description="Nomor owner dipisah koma. Kosong = balas semua chat 1:1."
            id="wa-owners"
            label="WhatsApp owner numbers"
            onBlur={() =>
              onPatchIntegrations({
                whatsappOwnerNumbers: int.whatsappOwnerNumbers,
              })
            }
            onChange={(v) =>
              onIntegrationsFieldChange({ whatsappOwnerNumbers: v })
            }
            placeholder="6281234567890, 6289876543210"
            value={int.whatsappOwnerNumbers}
          />
          <ConfigField
            description="Override model OpenRouter khusus WhatsApp."
            id="wa-model"
            label="WhatsApp model ID"
            onBlur={() =>
              onPatchIntegrations({ whatsappModel: int.whatsappModel })
            }
            onChange={(v) => onIntegrationsFieldChange({ whatsappModel: v })}
            placeholder="meta-llama/llama-3.3-70b-instruct:free"
            value={int.whatsappModel}
          />
        </section>
      </div>
    </div>
  );
}
