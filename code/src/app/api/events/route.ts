import { getCurrentAdvisor } from "@/lib/auth/advisor";
import { subscribe } from "@/lib/events/bus";

const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events for the company dashboard: every event from the in-process bus, as
 * `data: <json>` lines. Requires the advisor cookie. Browsers reconnect automatically.
 */
export async function GET(request: Request): Promise<Response> {
  const advisor = await getCurrentAdvisor();
  if (!advisor) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\n: connected as ${advisor.id}\n\n`);
      const unsubscribe = subscribe((event) => send(`data: ${JSON.stringify(event)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        cleanup = () => {};
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
