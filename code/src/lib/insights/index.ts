import "server-only";
import { analyzeConversation } from "./analyze";
import { createKeyedDebouncer, type KeyedDebouncer } from "./scheduler";

/** Quiet period after the last turn before a conversation is (re)analysed. */
const DEBOUNCE_MS = 3_000;
/** Parallel classifier runs across all conversations (simulations produce bursts). */
const MAX_CONCURRENT = 4;

// One scheduler per server process; survives dev hot reloads like the event bus. The run
// function is looked up on every call so edits to the classifier apply without a restart.
const globalForInsights = globalThis as unknown as {
  paxInsights?: KeyedDebouncer;
  paxAnalyze?: typeof analyzeConversation;
};
globalForInsights.paxAnalyze = analyzeConversation;
const debouncer =
  globalForInsights.paxInsights ??
  createKeyedDebouncer({
    delayMs: DEBOUNCE_MS,
    maxConcurrent: MAX_CONCURRENT,
    run: async (conversationId) => {
      await (globalForInsights.paxAnalyze ?? analyzeConversation)(conversationId);
    },
    onError: (conversationId, error) =>
      console.error(`[insights] analysis failed for ${conversationId}`, error),
  });
globalForInsights.paxInsights = debouncer;

/**
 * Called by the advisor after every completed turn. Returns immediately; the classifier, FAQ
 * extraction, handover check and lead scoring run in the background (debounced per
 * conversation, never two runs for one conversation at once) and publish `analysis.updated` /
 * `lead.upserted` when done.
 */
export function scheduleAnalysis(conversationId: string): void {
  debouncer.schedule(conversationId);
}

export function isAnalysisPending(conversationId: string): boolean {
  return debouncer.isPending(conversationId);
}

export { analyzeConversation } from "./analyze";
