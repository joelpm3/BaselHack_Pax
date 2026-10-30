import "server-only";
import { EventEmitter } from "node:events";

/**
 * In-process event bus feeding the company dashboard over SSE (/api/events).
 * Single Node process only (local demo); swap for Postgres LISTEN/NOTIFY or Redis when scaling out.
 */
export type PaxEvent =
  | {
      type: "conversation.started";
      conversationId: string;
      customerId: string;
      isSimulated: boolean;
    }
  | {
      type: "conversation.message";
      conversationId: string;
      role: "user" | "assistant";
      preview: string;
    }
  | { type: "conversation.updated"; conversationId: string }
  | { type: "analysis.updated"; conversationId: string }
  | { type: "lead.upserted"; leadId: string; conversationId: string | null }
  | { type: "handover.created"; handoverId: string; conversationId: string }
  | { type: "document.updated"; documentId: string; customerId: string }
  | { type: "policy.created"; policyId: string; customerId: string }
  | { type: "simulation.updated"; runId: string };

type Stamped = PaxEvent & { at: number };

const globalForBus = globalThis as unknown as { paxBus?: EventEmitter };
const emitter = globalForBus.paxBus ?? new EventEmitter();
emitter.setMaxListeners(200);
globalForBus.paxBus = emitter;

export function publish(event: PaxEvent): void {
  emitter.emit("event", { ...event, at: Date.now() } satisfies Stamped);
}

export function subscribe(listener: (event: Stamped) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}
