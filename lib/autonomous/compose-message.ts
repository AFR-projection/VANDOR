import type { SystemAwarenessSnapshot } from "./awareness";
import { formatAwarenessForUser } from "./awareness";
import type { Issue, ObservationBundle } from "./healing/detectors";
import { isLlmConfigured, llmChat } from "./llm";

const SYSTEM = `Kamu VANDOR — satu AI agent (bukan "Operator" terpisah). Tulis pesan WhatsApp ke owner deployment.

Aturan:
- Bahasa Indonesia natural, max 10 baris, seperti kamu yang bicara langsung.
- Gunakan HANYA fakta dari konteks JSON — jangan mengarang metrik.
- Boleh emoji ringan (1-2), tanpa markdown berat, tanpa heading.
- Tanya 1 hal konkret jika perlu tindak lanjut owner.
- Jangan bilang "VANDOR Operator" sebagai entitas lain — kamu VANDOR.`;

export type OperatorMessageKind =
  | "alert"
  | "checkin"
  | "startup"
  | "code_fix_ok"
  | "code_fix_failed";

/** Susun pesan WA dari LLM berdasarkan state nyata — bukan template kaku. */
export async function composeOperatorWhatsappMessage(input: {
  kind: OperatorMessageKind;
  snapshot?: SystemAwarenessSnapshot | null;
  obs?: ObservationBundle;
  issues?: Issue[];
  extra?: string;
}): Promise<string | null> {
  if (!(await isLlmConfigured())) {
    return null;
  }

  const snapshot = input.snapshot;
  const issues = input.issues ?? snapshot?.issues ?? [];

  const context = {
    kind: input.kind,
    healthScore: snapshot?.healthScore,
    grade: snapshot?.grade,
    summary: snapshot?.summary,
    details: snapshot ? formatAwarenessForUser(snapshot) : undefined,
    issues: issues.slice(0, 6).map((i) => ({
      severity: i.severity,
      title: i.title,
      detail: i.detail.slice(0, 150),
    })),
    metrics: input.obs
      ? {
          cpu: input.obs.metrics.cpuPct,
          mem: input.obs.metrics.memUsedPct,
          disk: input.obs.metrics.diskUsedPct,
        }
      : snapshot?.metrics
        ? {
            cpu: snapshot.metrics.cpuPct,
            mem: snapshot.metrics.memUsedPct,
            disk: snapshot.metrics.diskUsedPct,
          }
        : undefined,
    extra: input.extra?.slice(0, 500),
  };

  const kindHint: Record<OperatorMessageKind, string> = {
    alert:
      "Ada isu/error/critical — beri tahu owner, singkat & jelas, tawarkan bantu investigasi.",
    checkin:
      "Check-in proaktif — sistem relatif sehat, tanya apa yang perlu dibantu hari ini.",
    startup:
      "Worker baru online — sapa singkat, konfirmasi kamu memantau 24/7.",
    code_fix_ok: "Auto-fix codebase berhasil — kabari sukses singkat.",
    code_fix_failed:
      "Auto-fix gagal — jelaskan masalah tanpa spam, arahkan cek Operator jika perlu.",
  };

  const prompt = `${kindHint[input.kind]}

Konteks JSON:
${JSON.stringify(context, null, 2)}

Tulis pesan WA:`;

  const text = await llmChat(prompt, {
    system: SYSTEM,
    temperature: 0.45,
    maxTokens: 450,
    timeoutMs: 25_000,
  });

  const trimmed = text?.trim();
  if (!trimmed || trimmed.length < 12) {
    return null;
  }
  return trimmed.slice(0, 900);
}
