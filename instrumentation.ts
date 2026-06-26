import { registerOTel } from "@vercel/otel";

export async function register() {
  registerOTel({ serviceName: "chatbot" });

  // Auto-connect WhatsApp on server start when saved credentials exist.
  // Use dynamic imports so Node.js built-ins are never evaluated in the Edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    setTimeout(async () => {
      try {
        const { resolveDeploymentOwnerUser } = await import(
          "@/lib/whatsapp/deployment-owner"
        );
        const { hasPersistedWhatsappAuth } = await import(
          "@/lib/whatsapp/auth-persist"
        );
        const owner = await resolveDeploymentOwnerUser();
        if (!owner) {
          return;
        }

        const hasCredentials = await hasPersistedWhatsappAuth(owner.id);
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
