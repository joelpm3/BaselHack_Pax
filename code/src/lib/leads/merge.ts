import type { LeadStatus, LeadType } from "@/lib/domain/taxonomy";

/**
 * Which existing lead a conversation's analysis updates instead of creating another one. Pure,
 * so the "one open lead per conversation, no duplicates per customer" rule is unit-tested.
 */
export interface LeadRef {
  id: string;
  conversationId: string | null;
  type: LeadType;
  status: LeadStatus;
  updatedAt: Date;
}

const CLOSED: readonly LeadStatus[] = ["won", "lost"];

function latest<T extends LeadRef>(leads: T[]): T | undefined {
  return leads.toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
}

/**
 * 1. This conversation's lead of that type (in any status: (conversation, type) is unique).
 * 2. This conversation's open lead of another type: it is re-typed, never duplicated.
 * 3. The customer's open lead of that type from another conversation: merged, not duplicated.
 * Otherwise a new lead is created (undefined).
 */
export function leadToUpdate<T extends LeadRef>(
  customerLeads: T[],
  conversationId: string,
  type: LeadType,
): T | undefined {
  const open = customerLeads.filter((l) => !CLOSED.includes(l.status));
  const own = (l: T) => l.conversationId === conversationId;
  return (
    customerLeads.find((l) => own(l) && l.type === type) ??
    latest(open.filter(own)) ??
    latest(open.filter((l) => l.type === type))
  );
}
