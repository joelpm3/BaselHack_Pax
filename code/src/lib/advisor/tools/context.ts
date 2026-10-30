import type { ConversationMode, Locale } from "@/lib/domain/taxonomy";
import type { ActiveRuleSet } from "@/lib/rules/active";

/** Everything a tool needs to act on behalf of the current conversation. */
export interface ToolContext {
  conversationId: string;
  customerId: string;
  locale: Locale;
  mode: ConversationMode;
  ruleSet: ActiveRuleSet;
  /** Id of the assistant message being generated (for provenance of profile changes). */
  assistantMessageId?: string;
}
