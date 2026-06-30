import { auth } from "@/app/(auth)/auth";
import { isPlatformV2Enabled, platformConfig } from "@/lib/platform/config";
import { pollPlatformEventsForUser } from "@/lib/platform/dashboard/service";
import { bootstrapPlatformV2 } from "@/lib/platform/init";
import { requireClientAccess } from "@/lib/security/client-access";

/**
 * GET /api/platform/events/live
 *
 * SSE feed — poll PlatformEvent untuk user (workflow multi-agent live).
 */
export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }

  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  bootstrapPlatformV2();

  if (!isPlatformV2Enabled()) {
    return new Response("Platform V2 disabled", { status: 503 });
  }

  const userId = session.user.id;
  const pollMs = Math.max(platformConfig.eventPollMs, 500);
  const encoder = new TextEncoder();
  let cursor = new Date();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      const poll = async () => {
        try {
          const events = await pollPlatformEventsForUser(userId, cursor, 30);
          if (events.length > 0) {
            const last = events.at(-1);
            if (last) {
              cursor = new Date(last.createdAt);
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ events })}\n\n`)
            );
          }
        } catch {
          controller.enqueue(encoder.encode(": poll-error\n\n"));
        }
      };

      const pollTimer = setInterval(() => {
        void poll();
      }, pollMs);

      void poll();

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(pollTimer);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
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
