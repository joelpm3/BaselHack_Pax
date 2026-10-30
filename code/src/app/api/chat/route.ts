import { createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { getConversation } from "@/lib/advisor/conversations";
import { streamAdvisorTurn } from "@/lib/advisor/engine";
import { chatRequestSchema, sanitizeUserMessage } from "@/lib/advisor/user-message";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { db, schema } from "@/lib/db";

export const maxDuration = 120;

/** One advisor turn for the customer's own conversation, streamed as UI message chunks. */
export async function POST(req: Request) {
  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const customer = await getCurrentCustomer();
  const conversation = getConversation(parsed.data.id);
  if (!customer || !conversation || conversation.customerId !== customer.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const message = sanitizeUserMessage(parsed.data.message);
  if (!message) return Response.json({ error: "empty_message" }, { status: 400 });

  db.update(schema.customers)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.customers.id, customer.id))
    .run();

  const stream = await streamAdvisorTurn({
    conversation,
    message,
    trigger: parsed.data.trigger,
  });
  // The server branch keeps the turn running to the end (tools, persistence) even when the
  // browser reloads or leaves mid-answer; the client branch only mirrors it.
  const [toClient, toServer] = stream.tee();
  void drain(toServer);
  return createUIMessageStreamResponse({ stream: toClient });
}

async function drain(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // Persistence happens in the turn's end callback.
  }
}
