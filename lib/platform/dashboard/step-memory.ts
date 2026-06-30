import { getAgent } from "../core/agent-registry";
import type { MemoryScope, PlatformAgentId } from "../core/types";
import { scopeSectionLabel } from "../memory/scopes";
import { readAgentMemoryPack } from "../memory/types";

export type StepMemoryScopeChip = {
  scope: string;
  label: string;
  shortLabel: string;
  state: "configured" | "loaded" | "empty";
  charCount: number;
  preview: string | null;
};

export type StepMemoryView = {
  itemCount: number;
  totalChars: number;
  hasSnapshot: boolean;
  scopes: StepMemoryScopeChip[];
};

const PREVIEW_MAX = 140;

const SHORT_LABELS: Record<MemoryScope, string> = {
  short_term: "Run",
  long_term: "LTM",
  conversation: "Chat",
  project: "Proyek",
  user: "User",
  knowledge: "KB",
};

function scopeShortLabel(scope: MemoryScope): string {
  return SHORT_LABELS[scope];
}

function previewText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PREVIEW_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, PREVIEW_MAX)}…`;
}

function hasMemorySnapshot(
  output: Record<string, unknown> | null | undefined
): boolean {
  return readAgentMemoryPack(output ?? {}) !== null;
}

export function buildStepMemoryView(
  agentId: string,
  output: Record<string, unknown> | null | undefined,
  stepStatus: string
): StepMemoryView {
  const agent = getAgent(agentId as PlatformAgentId);
  const configured = agent?.memoryScopes ?? [];
  const pack = readAgentMemoryPack(output ?? {});
  const snapshot = hasMemorySnapshot(output);
  const resolved =
    snapshot &&
    (stepStatus === "running" ||
      stepStatus === "completed" ||
      stepStatus === "failed");

  const scopes: StepMemoryScopeChip[] = configured.map((scope) => {
    const content = pack?.byScope?.[scope];
    const charCount = content?.length ?? 0;
    let state: StepMemoryScopeChip["state"];
    if (resolved) {
      state = charCount > 0 ? "loaded" : "empty";
    } else {
      state = "configured";
    }

    return {
      scope,
      label: scopeSectionLabel(scope),
      shortLabel: scopeShortLabel(scope),
      state,
      charCount,
      preview: charCount > 0 && content ? previewText(content) : null,
    };
  });

  const totalChars = pack
    ? Object.values(pack.byScope ?? {}).reduce(
        (sum, value) => sum + (value?.length ?? 0),
        0
      )
    : 0;

  return {
    itemCount: pack?.itemCount ?? 0,
    totalChars,
    hasSnapshot: snapshot,
    scopes,
  };
}
