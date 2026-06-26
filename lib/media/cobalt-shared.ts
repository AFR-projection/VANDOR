import "server-only";

export type CobaltResponse = {
  status: string;
  url?: string;
  filename?: string;
  error?: { code?: string; context?: unknown };
  headers?: Record<string, string>;
};

/** Node fetch butuh skema lengkap — browser tidak. */
export function normalizeHttpUrl(raw: string, label: string): string {
  let candidate = raw.trim();
  if (!candidate) {
    throw new Error(`${label} kosong.`);
  }
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }
  try {
    return new URL(candidate).href;
  } catch {
    throw new Error(
      `${label} tidak valid ("${raw}"). Contoh: https://cobalt-api-production-2f6c.up.railway.app`
    );
  }
}

export async function resolveCobaltApiBase(): Promise<string> {
  const { getIntegrationRuntimeConfig } = await import(
    "@/lib/settings/integration-runtime"
  );
  const cfg = await getIntegrationRuntimeConfig();
  const raw = cfg.cobalt.apiUrl;
  if (!raw) {
    return "https://api.cobalt.tools";
  }
  return normalizeHttpUrl(raw, "Cobalt API URL").replace(/\/$/, "");
}

/** Sync fallback — env only (scripts). */
export function resolveCobaltApiBaseFromEnv(): string {
  const raw = process.env.COBALT_API_URL?.trim();
  if (!raw) {
    return "https://api.cobalt.tools";
  }
  return normalizeHttpUrl(raw, "COBALT_API_URL").replace(/\/$/, "");
}

export function resolveCobaltDownloadUrl(
  cobaltBase: string,
  url: string
): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const base = cobaltBase.replace(/\/$/, "");
  if (trimmed.startsWith("/")) {
    return `${base}${trimmed}`;
  }
  return new URL(trimmed, `${base}/`).href;
}

export function isOnCobaltHost(
  cobaltBase: string,
  downloadUrl: string
): boolean {
  try {
    return new URL(downloadUrl).host === new URL(cobaltBase).host;
  } catch {
    return false;
  }
}

export function isCobaltTunnelUrl(
  cobaltBase: string,
  downloadUrl: string
): boolean {
  try {
    const baseHost = new URL(cobaltBase).host;
    const target = new URL(downloadUrl);
    return target.host === baseHost && target.pathname.includes("/tunnel");
  } catch {
    return downloadUrl.includes("/tunnel");
  }
}

export function buildCobaltFetchHeaders(input: {
  status: string;
  downloadUrl: string;
  cobaltBase: string;
  responseHeaders?: Record<string, string>;
  apiKey?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...(input.responseHeaders ?? {}),
    Accept: "*/*",
  };
  if (
    input.apiKey &&
    (input.status === "tunnel" ||
      isCobaltTunnelUrl(input.cobaltBase, input.downloadUrl) ||
      isOnCobaltHost(input.cobaltBase, input.downloadUrl))
  ) {
    headers.Authorization = `Api-Key ${input.apiKey}`;
  }
  return headers;
}

export async function hasCobaltBackend(): Promise<boolean> {
  const { getIntegrationRuntimeConfig } = await import(
    "@/lib/settings/integration-runtime"
  );
  const cfg = await getIntegrationRuntimeConfig();
  return cfg.cobalt.configured;
}

export function hasCobaltBackendFromEnv(): boolean {
  return Boolean(
    process.env.COBALT_API_URL?.trim() ||
      process.env.COBALT_ALLOW_PUBLIC === "1"
  );
}
