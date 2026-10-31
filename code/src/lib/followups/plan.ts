import { addDays, addMonths, daysBetween } from "@/lib/documents/dates";
import type { FutureEventStatus } from "./taxonomy";

/**
 * Pure decisions of the follow-up engine, separate from the database so the lead lifecycle is
 * unit-tested: when a future event becomes a Wiedervorlage, when the reminder goes out, when the
 * lead is lost and when it is reopened.
 */

export interface FollowUpConfig {
  /** Days before the expected date the Wiedervorlage opens and the first email goes out. */
  leadDays: number;
  /** Days without a reaction before the next email (and, after the last one, "lost"). */
  reminderDays: number;
  /** Emails without a reaction before the lead is lost. */
  maxEmails: number;
}

export const DEFAULT_FOLLOW_UP_CONFIG: FollowUpConfig = {
  leadDays: 7,
  reminderDays: 14,
  maxEmails: 2,
};

export interface EventState {
  status: FutureEventStatus;
  expectedDate: string;
  /** Emails of this event, any order. */
  emails: Array<{ sequence: number; sentOn: string; replied: boolean }>;
  /** The customer wrote in the chat after the first follow-up email went out. */
  cameBack: boolean;
  /** An advisor already moved the lead on (meeting, offer, won): no more emails needed. */
  leadInProgress?: boolean;
}

export type EventAction =
  | { type: "open" }
  | { type: "remind"; sequence: number }
  | { type: "lose" }
  | { type: "respond"; reopen: boolean };

export function followUpDate(expectedDate: string, config: FollowUpConfig): string {
  return addDays(expectedDate, -config.leadDays);
}

export function planEvent(
  event: EventState,
  today: string,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
): EventAction | null {
  const reacted = event.cameBack || event.emails.some((e) => e.replied);
  switch (event.status) {
    case "upcoming":
      return today >= followUpDate(event.expectedDate, config) ? { type: "open" } : null;
    case "due": {
      if (reacted || event.leadInProgress) return { type: "respond", reopen: false };
      const last = event.emails.toSorted((a, b) => b.sequence - a.sequence)[0];
      if (!last) return { type: "remind", sequence: 1 };
      if (daysBetween(last.sentOn, today) < config.reminderDays) return null;
      return last.sequence < config.maxEmails
        ? { type: "remind", sequence: last.sequence + 1 }
        : { type: "lose" };
    }
    case "lost":
      return reacted ? { type: "respond", reopen: true } : null;
    default:
      return null;
  }
}

export interface CheckinState {
  enabled: boolean;
  hasEmail: boolean;
  /** Business date of the last check-in email, if any. */
  lastSentOn: string | null;
  /** When the relationship started (first check-in a year after this). */
  since: string;
}

export function nextCheckinDate(state: Pick<CheckinState, "lastSentOn" | "since">): string {
  return addMonths(state.lastSentOn ?? state.since, 12);
}

export function isCheckinDue(state: CheckinState, today: string): boolean {
  return state.enabled && state.hasEmail && today >= nextCheckinDate(state);
}
