import { registerOTel } from "@vercel/otel";

export async function register() {
  registerOTel({ serviceName: "chatbot" });

  // Auto-connect WhatsApp on server start when saved credentials exist.
  // Use dynamic imports so Node.js built-ins are never evaluated in the Edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    setTimeout(async () => {
      try {
        const { access } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const credsPath = join(process.cwd(), ".whatsapp-auth", "creds.json");
        const hasCredentials = await access(credsPath)
          .then(() => true)
          .catch(() => false);

        if (hasCredentials) {
          const { connectWhatsapp } = await import("@/lib/whatsapp/manager");
          await connectWhatsapp();
          console.log("[wa] Auto-connect started from saved credentials");
        }
      } catch (err) {
        console.error("[wa] Auto-connect failed:", err);
      }
    }, 2000);
  }
}
