/**
 * Turn unknown thrown values / API error payloads into a user-visible string.
 */
export function toErrorMessage(err: unknown): string {
  if (err == null) {
    return "Kesalahan tidak diketahui";
  }
  if (typeof err === "string") {
    return err.trim() || "Kesalahan tidak diketahui";
  }
  if (typeof err === "number" || typeof err === "boolean") {
    return String(err);
  }
  if (err instanceof Error) {
    return err.message.trim() || err.name || "Kesalahan tidak diketahui";
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) {
      return o.message.trim();
    }
    if (typeof o.error === "string" && o.error.trim()) {
      return o.error.trim();
    }
    if (typeof o.context === "string" && o.context.trim()) {
      return o.context.trim();
    }
    if (o.context != null && typeof o.context === "object") {
      const nested = toErrorMessage(o.context);
      if (nested !== "Kesalahan tidak diketahui") {
        const code =
          typeof o.code === "string" && o.code.trim() ? o.code.trim() : "";
        return code ? `${code}: ${nested}` : nested;
      }
    }
    if (typeof o.code === "string" && o.code.trim()) {
      return o.code.trim();
    }
    if (typeof o.service === "string" && o.service.trim()) {
      return o.service.trim();
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") {
        return json.length > 480 ? `${json.slice(0, 477)}…` : json;
      }
    } catch {
      /* ignore */
    }
  }
  return String(err);
}
