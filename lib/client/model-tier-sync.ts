import {
  type ModelTierId,
  normalizeModelTier,
  tierCookieValue,
} from "@/lib/ai/model-tiers";

import { apiBasePath } from "@/lib/app-url";

const base = apiBasePath;

export function setChatModelCookie(mode: string) {
  document.cookie = `chat-model=${encodeURIComponent(mode)}; path=/; max-age=31536000; SameSite=Lax`;
}

export async function fetchAccountModelTier(): Promise<ModelTierId | null> {
  try {
    const res = await fetch(`${base()}/api/models/config`, {
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { modelTier?: string };
    if (!json.modelTier) return null;
    return normalizeModelTier(json.modelTier);
  } catch {
    return null;
  }
}

/** Persist tier to account + sync chat cookie. */
export async function persistModelTier(tier: ModelTierId): Promise<boolean> {
  const cookie = tierCookieValue(tier);
  setChatModelCookie(cookie);
  try {
    const res = await fetch(`${base()}/api/settings/general`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrations: { modelTier: tier } }),
      credentials: "same-origin",
    });
    return res.ok;
  } catch {
    return false;
  }
}
