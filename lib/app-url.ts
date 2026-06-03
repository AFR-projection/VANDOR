const DEFAULT_APP_URL = "http://localhost:3000";

/** Ensures a valid absolute URL (adds https:// if the env omits the scheme). */
export function resolveAppUrl(raw?: string | null): string {
  const trimmed = raw?.trim() || DEFAULT_APP_URL;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/$/, "");
}

export function getAppUrl(): string {
  return resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL);
}
