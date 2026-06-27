/**
 * Vercel BotID membutuhkan Web Crypto (crypto.subtle) — hanya tersedia di
 * secure context (HTTPS atau localhost). Deploy VPS via http://IP mematikan BotID.
 */

function isLocalHttpAppUrl(appUrl: string): boolean {
  if (!appUrl.startsWith("http://")) {
    return false;
  }
  const host = appUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:")
  );
}

function isBotIdDisabledByEnv(): boolean {
  return (
    process.env.VANDOR_DISABLE_BOTID === "1" ||
    process.env.NEXT_PUBLIC_VANDOR_DISABLE_BOTID === "1"
  );
}

/** Dipakai next.config (build time) — tanpa akses window. */
export function isBotIdEnabledAtBuild(): boolean {
  if (isBotIdDisabledByEnv()) {
    return false;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase() ?? "";
  if (appUrl.startsWith("http://") && !isLocalHttpAppUrl(appUrl)) {
    return false;
  }
  return true;
}

/** Dipakai instrumentation-client (runtime browser). */
export function isBotIdEnabledInBrowser(): boolean {
  if (isBotIdDisabledByEnv()) {
    return false;
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return false;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase() ?? "";
  if (appUrl.startsWith("http://") && !isLocalHttpAppUrl(appUrl)) {
    return false;
  }
  return true;
}
