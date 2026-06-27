import { isLlmConfigured, llmJson } from "./llm";
import type { Issue } from "./healing/detectors";
import type { SystemMetrics } from "./metrics";
import type { ServiceStatus } from "./services";

export type Assessment = {
  status: "healthy" | "degraded" | "critical";
  summary: string;
  recommendations: string[];
};

const SYSTEM_PROMPT = `Kamu adalah VANDOR Operator, AI SRE yang memantau server Linux.
Berikan penilaian SINGKAT & faktual dalam Bahasa Indonesia.
Jawab HANYA JSON valid: {"status":"healthy|degraded|critical","summary":"...","recommendations":["..."]}.
Jangan menyarankan perintah destruktif. Maksimal 3 rekomendasi.`;

/**
 * Penilaian LLM atas kondisi sistem. Opsional — jika OpenRouter tidak
 * dikonfigurasi, kembalikan null dan loop pakai heuristik saja.
 */
export async function assessSystem(input: {
  metrics: SystemMetrics;
  services: ServiceStatus[];
  issues: Issue[];
}): Promise<Assessment | null> {
  if (!isLlmConfigured()) {
    return null;
  }

  const compact = {
    metrics: {
      cpuPct: input.metrics.cpuPct,
      memUsedPct: input.metrics.memUsedPct,
      diskUsedPct: input.metrics.diskUsedPct,
      load1: input.metrics.load1,
      uptimeSec: input.metrics.uptimeSec,
    },
    servicesDown: input.services
      .filter((s) => !s.healthy)
      .map((s) => `${s.kind}:${s.name}=${s.state}`),
    issues: input.issues.map((i) => `${i.severity}:${i.title}`),
  };

  const prompt = `Kondisi sistem saat ini (JSON):\n${JSON.stringify(compact)}\n\nBeri penilaian JSON.`;

  return llmJson<Assessment>(prompt, {
    system: SYSTEM_PROMPT,
    temperature: 0.1,
    maxTokens: 400,
    timeoutMs: 25_000,
  });
}
