import { auth } from "@/app/(auth)/auth";
import { onAnyWaChatUpdated, onChatUpdated } from "@/lib/whatsapp/chat-push";

/**
 * GET /api/whatsapp/live?chatId=<uuid>
 *
 * Server-Sent Events endpoint that emits an event whenever a new WhatsApp
 * message is saved for the given chatId. The web chat page subscribes to this
 * so it can revalidate the message list in real-time without polling.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  if (!chatId) {
    return new Response("Missing chatId", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat so the connection establishes.
      controller.enqueue(encoder.encode(": connected\n\n"));

      // chatId="*" means "notify me of any WA chat update" (used by sidebar).
      const unsub =
        chatId === "*"
          ? onAnyWaChatUpdated((updatedId) => {
              try {
                controller.enqueue(
                  encoder.encode(`data: ${updatedId}\n\n`)
                );
              } catch {
                // stream already closed
              }
            })
          : onChatUpdated(chatId, () => {
              try {
                controller.enqueue(encoder.encode("data: updated\n\n"));
              } catch {
                // stream already closed
              }
            });

      // Heartbeat every 25 s to keep the connection alive through proxies.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        unsub();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
