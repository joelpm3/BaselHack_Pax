import type { ConversationMode, Locale } from "@/lib/domain/taxonomy";
import type { ActiveRuleSet } from "@/lib/rules/active";

/** Everything a tool needs to act on behalf of the current conversation. */
export interface ToolContext {
  conversationId: string;
  customerId: string;
  locale: Locale;
  mode: ConversationMode;
  ruleSet: ActiveRuleSet;
}
