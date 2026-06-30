import type { CodeScanStep } from "./coding-agent/scan";

const BIOME_CONFIG_MARKERS = [
  "noQuickfixBiome",
  "noUnknownAtRules",
  "unknown rule",
  "was not found in the configuration",
  "biome.jsonc",
  "Failed to parse",
];

/** Error lint/config yang tidak bisa di-auto-fix di VPS (versi ultracite/biome). */
export function isToolingConfigFailure(step: CodeScanStep): boolean {
  if (step.name !== "ultracite") {
    return false;
  }
  const text = `${step.outputTail}\n${step.command}`.toLowerCase();
  return BIOME_CONFIG_MARKERS.some((m) => text.includes(m.toLowerCase()));
}

export function scanFailureIsToolingOnly(steps: CodeScanStep[]): boolean {
  const failed = steps.filter((s) => !s.ok);
  if (failed.length === 0) {
    return false;
  }
  return failed.every(
    (s) => isToolingConfigFailure(s) || s.name === "git-dirty"
  );
}

export function toolingFailureDiagnosis(steps: CodeScanStep[]): string {
  const failed = steps.filter((s) => !s.ok);
  const names = failed.map((s) => s.name).join(", ");
  return (
    `Scan gagal karena masalah tooling/konfigurasi (${names}) — bukan error runtime app. ` +
    "Ultracite/Biome di server mungkin versi beda; auto-fix tidak bisa memperbaiki ini. " +
    "Perbaiki manual: `npm update ultracite @biomejs/biome` atau skip lint di agent."
  );
}
