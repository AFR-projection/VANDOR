"use client";

import {
  BookOpenIcon,
  ChevronDownIcon,
  FlaskConicalIcon,
  KeyIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  Trash2Icon,
  UploadIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AgentSkillCategory,
  AgentSkillType,
} from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { formatApiError } from "@/lib/agent-skills/format-api-error";
import { apiBasePath } from "@/lib/app-url";

const base = apiBasePath;

type Skill = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: AgentSkillCategory;
  skillType: AgentSkillType;
  config: Record<string, unknown>;
  isActive: boolean;
  isBuiltin: boolean;
  rateLimitPerHour: number;
  createdAt: string;
  updatedAt: string;
};

type ApiKey = { id: string; name: string; masked: string };

type SkillLog = {
  id: string;
  skillSlug: string;
  skillName: string;
  status: string;
  executionTimeMs: number | null;
  errorMessage: string | null;
  request: unknown;
  response: unknown;
  createdAt: string;
};

type KbDoc = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
};

const SKILL_TYPES: { value: AgentSkillType; label: string }[] = [
  { value: "http_api", label: "API HTTP" },
  { value: "parlay_calculator", label: "Mix Parlay CS" },
  { value: "knowledge_base", label: "Knowledge Base" },
  { value: "web_search", label: "Web Search" },
  { value: "database", label: "Database" },
  { value: "workflow", label: "Workflow" },
];

const CATEGORIES: { value: AgentSkillCategory; label: string }[] = [
  { value: "api", label: "API" },
  { value: "knowledge_base", label: "Knowledge Base" },
  { value: "web_search", label: "Web Search" },
  { value: "database", label: "Database" },
  { value: "workflow", label: "Workflow" },
  { value: "integration", label: "Integrasi" },
  { value: "builtin", label: "Bawaan" },
];

async function fetchSkills(): Promise<{ skills: Skill[]; apiKeys: ApiKey[] }> {
  const res = await fetch(`${base()}/api/agent-skills`, { cache: "no-store" });
  if (!res.ok) throw new Error("Gagal memuat skills");
  return res.json();
}

async function fetchLogs(): Promise<{ logs: SkillLog[] }> {
  const res = await fetch(`${base()}/api/agent-skills/logs?limit=80`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat log");
  return res.json();
}

async function fetchKb(): Promise<{ documents: KbDoc[] }> {
  const res = await fetch(`${base()}/api/agent-skills/knowledge-base`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat dokumen KB");
  return res.json();
}

const defaultHttpConfig = {
  method: "GET",
  endpoint: "https://api.example.com/data",
  headers: {},
  parameters: {
    city: { type: "string", required: true, in: "query" },
  },
  auth: { type: "none" },
};

/** Hindari retry/focus refresh yang bikin panel flicker */
const skillsSwrOptions = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  refreshInterval: 0,
  errorRetryCount: 0,
  shouldRetryOnError: false,
  dedupingInterval: 60_000,
} as const;

function SkillForm({
  initial,
  apiKeys,
  onSaved,
  onCancel,
}: {
  initial?: Skill;
  apiKeys: ApiKey[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<AgentSkillCategory>(
    initial?.category ?? "api"
  );
  const [skillType, setSkillType] = useState<AgentSkillType>(
    initial?.skillType ?? "http_api"
  );
  const [configJson, setConfigJson] = useState(
    JSON.stringify(initial?.config ?? defaultHttpConfig, null, 2)
  );
  const [rateLimit, setRateLimit] = useState(
    String(initial?.rateLimitPerHour ?? 120)
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(configJson) as Record<string, unknown>;
      } catch {
        toast({ type: "error", description: "JSON config tidak valid" });
        return;
      }

      const payload = {
        slug: slug || undefined,
        name,
        description,
        category,
        skillType,
        config,
        rateLimitPerHour: Number(rateLimit) || 120,
      };

      const url = initial
        ? `${base()}/api/agent-skills/${initial.id}`
        : `${base()}/api/agent-skills`;
      const res = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          description: formatApiError(data.error, "Gagal menyimpan skill"),
        });
        return;
      }
      toast({ type: "success", description: "Skill disimpan" });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      {!initial && (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="skill-slug">
            Slug (unik, lowercase)
          </label>
          <Input
            id="skill-slug"
            onChange={(e) => setSlug(e.target.value)}
            placeholder="check_weather"
            value={slug}
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="skill-name">
          Nama Skill
        </label>
        <Input
          id="skill-name"
          onChange={(e) => setName(e.target.value)}
          value={name}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="skill-desc">
          Deskripsi (AI baca ini untuk memilih tool)
        </label>
        <Textarea
          id="skill-desc"
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          value={description}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="skill-category">
            Kategori
          </label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id="skill-category"
            onChange={(e) => setCategory(e.target.value as AgentSkillCategory)}
            value={category}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="skill-type">
            Tipe
          </label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={initial?.isBuiltin}
            id="skill-type"
            onChange={(e) => {
              const t = e.target.value as AgentSkillType;
              setSkillType(t);
              if (t === "http_api") {
                setConfigJson(JSON.stringify(defaultHttpConfig, null, 2));
              } else if (t === "database") {
                setConfigJson(
                  JSON.stringify(
                    {
                      engine: "postgresql",
                      connectionApiKeyId: apiKeys[0]?.id ?? "",
                      allowedTables: [],
                      maxRows: 100,
                      readOnly: true,
                    },
                    null,
                    2
                  )
                );
              } else if (t === "workflow") {
                setConfigJson(
                  JSON.stringify(
                    { steps: [{ skillSlug: "web_search_agent" }] },
                    null,
                    2
                  )
                );
              }
            }}
            value={skillType}
          >
            {SKILL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="skill-config">
          Konfigurasi JSON
        </label>
        <Textarea
          className="font-mono text-xs"
          id="skill-config"
          onChange={(e) => setConfigJson(e.target.value)}
          rows={12}
          value={configJson}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="skill-rate">
          Rate limit (/jam)
        </label>
        <Input
          id="skill-rate"
          onChange={(e) => setRateLimit(e.target.value)}
          type="number"
          value={rateLimit}
        />
      </div>
      <div className="flex gap-2">
        <Button disabled={saving} onClick={handleSave} type="button">
          {saving ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
          Simpan
        </Button>
        <Button onClick={onCancel} type="button" variant="outline">
          Batal
        </Button>
      </div>
    </div>
  );
}

export function AgentSkillsPanel() {
  const [view, setView] = useState<"list" | "create" | "edit" | "logs" | "kb">(
    "list"
  );

  const { data, mutate, isLoading, error } = useSWR(
    "agent-skills",
    fetchSkills,
    skillsSwrOptions
  );
  const { data: logData, mutate: mutateLogs } = useSWR(
    view === "logs" ? "agent-skill-logs" : null,
    fetchLogs,
    skillsSwrOptions
  );
  const { data: kbData, mutate: mutateKb } = useSWR(
    view === "kb" ? "agent-kb" : null,
    fetchKb,
    skillsSwrOptions
  );
  const [editing, setEditing] = useState<Skill | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testParams, setTestParams] = useState("{}");
  const [testing, setTesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");

  const skills = data?.skills ?? [];
  const apiKeys = data?.apiKeys ?? [];
  const logs = logData?.logs ?? [];
  const documents = kbData?.documents ?? [];

  const toggleActive = async (skill: Skill) => {
    const res = await fetch(`${base()}/api/agent-skills/${skill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !skill.isActive }),
    });
    if (res.ok) {
      mutate();
      toast({
        type: "success",
        description: skill.isActive ? "Skill dinonaktifkan" : "Skill diaktifkan",
      });
    }
  };

  const deleteSkill = async (skill: Skill) => {
    if (skill.isBuiltin) return;
    const res = await fetch(`${base()}/api/agent-skills/${skill.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      mutate();
      toast({ type: "success", description: "Skill dihapus" });
    }
  };

  const runTest = async (skill: Skill) => {
    setTesting(true);
    try {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(testParams) as Record<string, unknown>;
      } catch {
        toast({ type: "error", description: "Parameter test JSON tidak valid" });
        return;
      }
      const res = await fetch(`${base()}/api/agent-skills/${skill.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: params }),
      });
      const result = await res.json();
      if (result.ok) {
        toast({
          type: "success",
          description: `Test OK (${result.executionTimeMs}ms)`,
        });
      } else {
        toast({ type: "error", description: formatApiError(result.error, "Test gagal") });
      }
      mutateLogs();
    } finally {
      setTesting(false);
    }
  };

  const uploadKb = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${base()}/api/agent-skills/knowledge-base`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ type: "error", description: formatApiError(data.error, "Upload gagal") });
          return;
        }
        toast({ type: "success", description: "Dokumen diindeks" });
        mutateKb();
      } finally {
        setUploading(false);
      }
    },
    [mutateKb]
  );

  const addApiKey = async () => {
    if (!newKeyName.trim() || !newKeyValue.trim()) return;
    const res = await fetch(`${base()}/api/agent-skills/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName, value: newKeyValue }),
    });
    if (res.ok) {
      setNewKeyName("");
      setNewKeyValue("");
      mutate();
      toast({ type: "success", description: "API key disimpan (terenkripsi)" });
    }
  };

  if (isLoading && !data && !error) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Memuat Agent Skills…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Gagal memuat skills. Pastikan migrasi database sudah dijalankan:{" "}
          <code className="text-xs">npm run db:migrate</code>
          <Button
            className="ml-3"
            onClick={() => mutate()}
            size="sm"
            type="button"
            variant="outline"
          >
            Coba lagi
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <WrenchIcon className="size-5 text-violet-400" />
            Agent Skills & Tools
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Kelola tool kustom untuk AI Agent. Skill aktif otomatis tersedia saat
            chat — AI memilih tool yang relevan berdasarkan deskripsi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              mutate();
              if (view === "logs") mutateLogs();
              if (view === "kb") mutateKb();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCwIcon className="mr-1 size-3.5" />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setView("create");
              setEditing(null);
            }}
            size="sm"
            type="button"
          >
            <PlusIcon className="mr-1 size-3.5" />
            Tambah Skill
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border/50 pb-2">
        {(
          [
            ["list", "Skills", WrenchIcon],
            ["kb", "Knowledge Base", BookOpenIcon],
            ["logs", "Log Eksekusi", ScrollTextIcon],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              view === id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            )}
            key={id}
            onClick={() => setView(id)}
            type="button"
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {(view === "create" || view === "edit") && (
        <SkillForm
          apiKeys={apiKeys}
          initial={view === "edit" ? (editing ?? undefined) : undefined}
          onCancel={() => {
            setView("list");
            setEditing(null);
          }}
          onSaved={() => {
            setView("list");
            setEditing(null);
            mutate();
          }}
        />
      )}

      {view === "list" && (
        <>
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <KeyIcon className="size-4" />
              API Keys (terenkripsi)
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Simpan token/API key atau connection string DB. Referensikan via{" "}
              <code>apiKeyId</code> / <code>connectionApiKeyId</code> di config skill.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {apiKeys.map((k) => (
                <span
                  className="rounded-md bg-muted px-2 py-1 text-xs"
                  key={k.id}
                >
                  {k.name} · {k.masked}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-[160px]"
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Nama key"
                value={newKeyName}
              />
              <Input
                className="min-w-[200px] flex-1"
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Nilai key / connection string"
                type="password"
                value={newKeyValue}
              />
              <Button onClick={addApiKey} size="sm" type="button">
                Simpan Key
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {skills.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada skill. Tambah skill HTTP API atau aktifkan skill bawaan.
              </p>
            )}
            {skills.map((skill) => (
              <div
                className="rounded-xl border border-border/60 bg-background/50"
                key={skill.id}
              >
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  onClick={() =>
                    setExpandedId(expandedId === skill.id ? null : skill.id)
                  }
                  type="button"
                >
                  <ZapIcon
                    className={cn(
                      "size-4 shrink-0",
                      skill.isActive ? "text-emerald-400" : "text-muted-foreground"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{skill.name}</span>
                      <code className="text-[11px] text-muted-foreground">
                        skill_{skill.slug}
                      </code>
                      {skill.isBuiltin && (
                        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                          bawaan
                        </span>
                      )}
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px]",
                          skill.isActive
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {skill.isActive ? "aktif" : "nonaktif"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {skill.description}
                    </p>
                  </div>
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      expandedId === skill.id && "rotate-180"
                    )}
                  />
                </button>

                {expandedId === skill.id && (
                  <div className="space-y-3 border-t border-border/40 px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Tipe: {skill.skillType}</span>
                      <span>·</span>
                      <span>Kategori: {skill.category}</span>
                      <span>·</span>
                      <span>Limit: {skill.rateLimitPerHour}/jam</span>
                    </div>
                    <pre className="max-h-40 overflow-auto rounded-lg bg-muted/40 p-2 font-mono text-[11px]">
                      {JSON.stringify(skill.config, null, 2)}
                    </pre>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => toggleActive(skill)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {skill.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                      <Button
                        onClick={() => {
                          setEditing(skill);
                          setView("edit");
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Edit
                      </Button>
                      {!skill.isBuiltin && (
                        <Button
                          onClick={() => deleteSkill(skill)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2Icon className="mr-1 size-3.5" />
                          Hapus
                        </Button>
                      )}
                    </div>
                    <div className="rounded-lg border border-dashed border-border/60 p-3">
                      <p className="mb-2 flex items-center gap-1 text-xs font-medium">
                        <FlaskConicalIcon className="size-3.5" />
                        Test Skill
                      </p>
                      <Textarea
                        className="mb-2 font-mono text-xs"
                        onChange={(e) => setTestParams(e.target.value)}
                        placeholder='{"city": "Jakarta"}'
                        rows={3}
                        value={testParams}
                      />
                      <Button
                        disabled={testing}
                        onClick={() => runTest(skill)}
                        size="sm"
                        type="button"
                      >
                        {testing ? (
                          <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                        ) : (
                          <FlaskConicalIcon className="mr-1 size-3.5" />
                        )}
                        Jalankan Test
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {view === "kb" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Unggah PDF, DOCX, TXT, CSV, atau JSON. Dokumen di-chunk dan diindeks
              untuk semantic search via skill{" "}
              <code>knowledge_base_search</code>.
            </p>
            <input
              accept=".pdf,.docx,.txt,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadKb(f);
                e.target.value = "";
              }}
              ref={fileRef}
              type="file"
            />
            <Button
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              {uploading ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <UploadIcon className="mr-2 size-4" />
              )}
              Upload Dokumen
            </Button>
          </div>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                key={doc.id}
              >
                <div>
                  <p className="text-sm font-medium">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.status} · {doc.chunkCount} chunk ·{" "}
                    {Math.round(doc.fileSize / 1024)} KB
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    await fetch(
                      `${base()}/api/agent-skills/knowledge-base/${doc.id}`,
                      { method: "DELETE" }
                    );
                    mutateKb();
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "logs" && (
        <div className="max-h-[480px] space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-black/20 p-3 font-mono text-xs">
          {logs.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              Belum ada log eksekusi skill.
            </p>
          )}
          {logs.map((log) => (
            <div
              className={cn(
                "rounded px-2 py-1.5",
                log.status === "error" ? "text-red-400" : "text-emerald-300/90"
              )}
              key={log.id}
            >
              <span className="text-muted-foreground">
                {new Date(log.createdAt).toLocaleString("id-ID")}{" "}
              </span>
              <span className="text-sky-300">{log.skillSlug}</span>{" "}
              {log.status === "ok" ? "OK" : "ERR"}
              {log.executionTimeMs != null && ` ${log.executionTimeMs}ms`}
              {log.errorMessage && ` — ${log.errorMessage}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
