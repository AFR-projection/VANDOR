import { ChatbotError } from "@/lib/errors";

/** User-facing error text for WhatsApp agent failures. */
export function formatWaAgentError(error: unknown): string {
  if (error instanceof ChatbotError) {
    const detail =
      typeof error.cause === "string" && error.cause.trim()
        ? error.cause.trim()
        : error.message;
    return detail;
  }
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }
  return "Maaf, ada error saat memproses pesan. Coba lagi ya.";
}
