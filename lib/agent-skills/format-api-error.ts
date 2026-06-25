/** Ubah fieldErrors Zod / objek error API jadi string untuk toast UI. */
export function formatApiError(
  error: unknown,
  fallback = "Terjadi kesalahan"
): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const parts: string[] = [];
    for (const [key, val] of Object.entries(error as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        parts.push(`${key}: ${val.map(String).join(", ")}`);
      } else if (typeof val === "string") {
        parts.push(`${key}: ${val}`);
      }
    }
    if (parts.length > 0) {
      return parts.join(" · ");
    }
  }
  return fallback;
}

export function formatZodFieldErrors(
  fieldErrors: Record<string, string[] | undefined>
): string {
  return formatApiError(fieldErrors, "Data skill tidak valid");
}
