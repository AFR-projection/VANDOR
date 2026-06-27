import { recordAgentAction } from "../audit";
import type { ToolContext, ToolDefinition, ToolResult } from "../types";

/**
 * Tool Manager — registry tool modular untuk otak otonom.
 *
 * Menambah kemampuan baru cukup: buat file tool yang meng-export
 * `ToolDefinition`, lalu panggil `registerTool(def)`. Loop/planner
 * tidak perlu diubah. Setiap eksekusi otomatis tercatat di audit log.
 */
const registry = new Map<string, ToolDefinition>();

export function registerTool<TInput>(def: ToolDefinition<TInput>): void {
  if (registry.has(def.name)) {
    throw new Error(`Tool '${def.name}' sudah terdaftar.`);
  }
  registry.set(def.name, def as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

/**
 * Eksekusi tool by name dengan validasi schema + audit otomatis.
 * Catatan: gate keamanan (rule engine / approval) ditambahkan di fase
 * berikutnya; di Fase 0 hanya tool `safe` yang terdaftar.
 */
export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, error: `Tool '${name}' tidak ditemukan` };
  }

  const started = Date.now();
  let input: unknown = rawInput;

  if (tool.schema) {
    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) {
      const error = `Input tidak valid untuk '${name}': ${parsed.error.message}`;
      await recordAgentAction({
        taskId: ctx.task?.id ?? null,
        tool: name,
        action: "validate",
        input: rawInput,
        status: "error",
        riskLevel: tool.risk,
        reason: error,
        durationMs: Date.now() - started,
      });
      return { ok: false, error };
    }
    input = parsed.data;
  }

  try {
    const result = await tool.execute(input as never, ctx);
    await recordAgentAction({
      taskId: ctx.task?.id ?? null,
      tool: name,
      action: "execute",
      input,
      output: result.summary ?? result.data,
      status: result.ok ? "ok" : "error",
      riskLevel: tool.risk,
      reason: result.error ?? null,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAgentAction({
      taskId: ctx.task?.id ?? null,
      tool: name,
      action: "execute",
      input,
      status: "error",
      riskLevel: tool.risk,
      reason: message,
      durationMs: Date.now() - started,
    });
    return { ok: false, error: message };
  }
}

/** Daftarkan tool bawaan Fase 0. */
export function registerBuiltinTools(): void {
  if (registry.has("system.ping")) {
    return;
  }
  registerTool({
    name: "system.ping",
    description: "Health-check internal worker (membuktikan pipeline berjalan).",
    risk: "safe",
    execute: (_input: Record<string, unknown>, _ctx: ToolContext) =>
      Promise.resolve<ToolResult>({
        ok: true,
        data: { pong: true, at: new Date().toISOString() },
        summary: "pong",
      }),
  });
}
