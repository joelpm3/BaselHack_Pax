import "server-only";

/**
 * CONTRACT (owned by the company-dashboard/insights area).
 * Called by the advisor after every completed turn. Must return immediately and run the
 * classifier + lead scoring in the background (debounced per conversation), then publish
 * `analysis.updated` / `lead.upserted` events.
 */
export function scheduleAnalysis(conversationId: string): void {
  void conversationId;
}
