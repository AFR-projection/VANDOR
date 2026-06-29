import { isLlmConfigured, llmChat } from "../llm";
import { describeOpenRouterKeyStatus } from "../openrouter-key";
import {
  scanFailureIsToolingOnly,
  toolingFailureDiagnosis,
} from "../scan-errors";
import type { CodeScanResult } from "./scan";

export type CodeFixAnalysis = {
  sessionId: string;
  ok: boolean;
  diagnosis: string;
  suggestedCommands: string[];
  needsApproval: boolean;
  skipNotify?: boolean;
};

const SYSTEM = `Kamu senior engineer VANDOR. Analisis hasil scan build/lint.
Berikan diagnosis singkat (Bahasa Indonesia) dan daftar perintah shell untuk memperbaiki.
DILARANG: rm -rf, reboot, git push, pipe curl|sh.
Format jawaban:
DIAGNOSIS:
<2-6 kalimat>

PERINTAH:
1. <command>
2. <command>
(max 5 perintah, hanya yang relevan)`;

/**
 * Coding agent — analisis error dari scan terakhir via LLM.
 * Tidak otomatis menulis kode; mengusulkan perintah perbaikan (butuh approval).
 */
export async function analyzeCodeScan(
  scan: CodeScanResult
): Promise<CodeFixAnalysis> {
  const failedSteps = scan.steps.filter((s) => !s.ok);
  if (failedSteps.length === 0) {
    return {
      sessionId: scan.sessionId,
      ok: true,
      diagnosis: "Tidak ada error — codebase lulus scan.",
      suggestedCommands: [],
      needsApproval: false,
    };
  }

  if (scanFailureIsToolingOnly(scan.steps)) {
    return {
      sessionId: scan.sessionId,
      ok: false,
      diagnosis: toolingFailureDiagnosis(scan.steps),
      suggestedCommands: [],
      needsApproval: false,
      skipNotify: true,
    };
  }

  const keyStatus = await describeOpenRouterKeyStatus();

  if (!(await isLlmConfigured())) {
    const manual = failedSteps
      .map((s) => `# ${s.name}\n${s.outputTail}`)
      .join("\n\n");
    const keyHint = keyStatus.configured
      ? "OpenRouter ada di Settings/env tapi worker tidak bisa memakai (cek AUTH_SECRET sama di web & worker, lalu pm2 reload --update-env)."
      : "OpenRouter belum tersedia — isi di Pengaturan → Integrasi atau OPENROUTER_API_KEY di .env.local worker.";
    return {
      sessionId: scan.sessionId,
      ok: false,
      diagnosis: `Scan gagal — ${keyHint}\n\n${manual.slice(0, 1200)}`,
      suggestedCommands: [
        `cd ${process.env.VANDOR_DEPLOY_PATH ?? "/var/www/vandor"} && npm run build`,
      ],
      needsApproval: true,
      skipNotify: scanFailureIsToolingOnly(scan.steps),
    };
  }

  const payload = failedSteps.map((s) => ({
    step: s.name,
    command: s.command,
    output: s.outputTail.slice(0, 1200),
  }));

  const raw =
    (await llmChat(`Hasil scan gagal:\n${JSON.stringify(payload, null, 2)}`, {
      system: SYSTEM,
      temperature: 0.15,
      maxTokens: 900,
      timeoutMs: 45_000,
    })) ?? "";

  const diagnosisMatch = /DIAGNOSIS:\s*([\s\S]*?)(?=PERINTAH:|$)/i.exec(raw);
  const commandsMatch = /PERINTAH:\s*([\s\S]*)/i.exec(raw);

  const diagnosis =
    diagnosisMatch?.[1]?.trim() ||
    raw.trim().slice(0, 800) ||
    "LLM tidak mengembalikan diagnosis.";

  const suggestedCommands: string[] = [];
  if (commandsMatch?.[1]) {
    for (const line of commandsMatch[1].split("\n")) {
      const cleaned = line.replace(/^\d+\.\s*/, "").trim();
      if (cleaned.length > 3 && !cleaned.startsWith("#")) {
        suggestedCommands.push(cleaned);
      }
    }
  }

  return {
    sessionId: scan.sessionId,
    ok: false,
    diagnosis,
    suggestedCommands: suggestedCommands.slice(0, 5),
    needsApproval: suggestedCommands.length > 0,
  };
}
