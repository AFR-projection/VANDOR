import "server-only";

import type { UserSettings } from "./types";

/** Hapus key undefined agar spread tidak menghapus bagian settings yang tidak di-PATCH. */
export function stripUndefinedSettingsPatch(
  patch: Partial<UserSettings>
): Partial<UserSettings> {
  const out: Partial<UserSettings> = {};
  if (patch.memory !== undefined) {
    out.memory = patch.memory;
  }
  if (patch.visualMemory !== undefined) {
    out.visualMemory = patch.visualMemory;
  }
  if (patch.advanced !== undefined) {
    out.advanced = patch.advanced;
  }
  if (patch.persona !== undefined) {
    out.persona = patch.persona;
  }
  if (patch.integrations !== undefined) {
    out.integrations = patch.integrations;
  }
  return out;
}
