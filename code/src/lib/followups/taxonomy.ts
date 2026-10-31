/**
 * Vocabulary of the follow-up feature (future life events, outbox, yearly check-in).
 * Labels live in `messages/<locale>/followups.json` under `kind.<key>` / `status.<key>`.
 */

export const FUTURE_EVENT_KINDS = [
  "end_of_studies",
  "first_job",
  "wedding",
  "child_birth",
  "home_purchase",
  "retirement",
  "child_turns_18",
  "child_turns_25",
  "contract_end",
  "job_change",
  "self_employment",
  "other",
] as const;
export type FutureEventKind = (typeof FUTURE_EVENT_KINDS)[number];

/** How exactly the customer named the date ("im März 2027" vs. "nächsten Sommer"). */
export const DATE_PRECISIONS = ["day", "month", "season", "year"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/**
 * upcoming: waiting for its follow-up date; due: Wiedervorlage open, emails going out;
 * responded: the customer replied or came back; lost: no reaction to two emails;
 * dismissed: an advisor closed it.
 */
export const FUTURE_EVENT_STATUSES = ["upcoming", "due", "responded", "lost", "dismissed"] as const;
export type FutureEventStatus = (typeof FUTURE_EVENT_STATUSES)[number];

export const OUTBOX_KINDS = ["event_follow_up", "yearly_checkin"] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];
