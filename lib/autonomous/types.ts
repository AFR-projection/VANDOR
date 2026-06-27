import type { z } from "zod";
import type {
  AgentRiskLevel,
  AgentTask as AgentTaskRow,
} from "@/lib/db/schema";
import type { Logger } from "./logger";

export type RiskLevel = AgentRiskLevel;
export type AgentTask = AgentTaskRow;

/** Konteks yang diberikan ke setiap tool saat dieksekusi. */
export type ToolContext = {
  logger: Logger;
  ownerUserId: string | null;
  /** True jika dijalankan dalam mode autonomous (boleh aksi `safe`/`moderate`). */
  autonomous: boolean;
  /** Task yang sedang berjalan (jika ada). */
  task?: AgentTask | null;
};

export type ToolResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  /** Output ringkas untuk audit log (string aman, tanpa secret). */
  summary?: string;
};

/**
 * Kontrak tool modular (plugin-style). Tool baru cukup mengimplementasi
 * interface ini lalu didaftarkan via `registerTool` — tidak perlu mengubah
 * loop atau planner.
 */
export type ToolDefinition<TInput = Record<string, unknown>> = {
  /** Nama unik, mis. "shell.exec", "monitor.cpu", "docker.restart". */
  name: string;
  /** Deskripsi singkat (dipakai planner/LLM untuk memilih tool). */
  description: string;
  /** Tingkat risiko default aksi tool ini. */
  risk: RiskLevel;
  /** Skema validasi input (zod). */
  schema?: z.ZodType<TInput>;
  /** Eksekusi tool. */
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolResult>;
};

/** Hasil tiap fase siklus OODA. */
export type Observation = {
  at: string;
  facts: Record<string, unknown>;
};

export type Analysis = {
  issues: string[];
  healthy: boolean;
};

export type Plan = {
  taskTypes: string[];
  note: string;
};
