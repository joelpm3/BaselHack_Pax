import "server-only";
import { generateText, Output } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { toIsoDate } from "@/lib/documents/dates";
import { FUTURE_EVENT_KINDS } from "./taxonomy";
import { RELATIVE_WHICH, resolveExpression, SEASONS, type Timing } from "./timing";

const MAX_EVENTS = 6;

export const futureEventsSchema = z.object({
  events: z
    .array(
      z.object({
        kind: z.enum(FUTURE_EVENT_KINDS),
        subject: z
          .string()
          .nullable()
          .describe('Who it concerns if not the customer, e.g. "Tochter Lena"; else null.'),
        quote: z
          .string()
          .describe("The customer's own words that name the event and its time, verbatim."),
        expression: z
          .string()
          .describe(
            'Only the time expression, verbatim, e.g. "in zwei Jahren", "nächsten Sommer".',
          ),
        timing: z
          .object({
            kind: z.enum(["duration", "season", "month", "year", "date", "age"]),
            amount: z.number().nullable().describe("duration: how many units"),
            unit: z.enum(["weeks", "months", "years"]).nullable(),
            season: z.enum(SEASONS).nullable(),
            month: z.number().int().nullable().describe("1–12"),
            day: z.number().int().nullable(),
            year: z.number().int().nullable().describe("Only if an absolute year is named."),
            which: z
              .enum(RELATIVE_WHICH)
              .nullable()
              .describe('"this" / "next" / "after_next" for diesen / nächsten / übernächsten.'),
            part: z.enum(["start", "middle", "end"]).nullable().describe("Anfang / Mitte / Ende"),
            age: z.number().int().nullable().describe("age: the age at which it happens"),
            birthYear: z
              .number()
              .int()
              .nullable()
              .describe("age: birth year of the person, from the conversation or profile"),
          })
          .describe("The time expression as structure; do not compute the date yourself."),
        confidence: z
          .number()
          .describe("0–1: how sure it is that this will happen around then (0.9 = stated plan)."),
        note: z.string().describe("One short German sentence: what the customer plans."),
      }),
    )
    .describe("Dated future life events. Empty if the customer named none."),
});
export type FutureEventExtraction = z.infer<typeof futureEventsSchema>;

export const FUTURE_EVENTS_INSTRUCTIONS = `You read a conversation between a customer and Pax's digital pension advisor (Pax is a Swiss life insurer).
Extract future life events the customer mentions together with a time, so a Pax advisor can follow up when the time comes.

Event kinds: end_of_studies (finishing studies or an apprenticeship), first_job, wedding, child_birth (pregnancy, planned child), home_purchase, retirement (incl. early retirement), child_turns_18, child_turns_25, contract_end (an insurance or pension contract that ends), job_change, self_employment, other (another dated change relevant to pension provision).

Rules:
- Only events in the future that the customer (not the advisor) stated or clearly confirmed, with a time named or derivable (e.g. "wenn meine Tochter 18 wird" plus her birth year from the profile).
- No time, no event. Past events are not extracted.
- quote: the customer's words, verbatim, in their language. expression: only the time part, verbatim.
- timing: the structure of the expression. "in zwei Jahren" → duration 2 years; "nächsten Sommer" → season summer, which next; "Ende nächsten Jahres" → year, which next, part end; "im März 2028" → month 3, year 2028; "wenn ich 65 werde" → age 65 with birthYear. Leave fields that do not apply null.
- Never compute calendar dates yourself; the system does that from the conversation date.
- At most ${MAX_EVENTS} events; one per real-world event.`;

interface Context {
  conversationId: string;
  customerId: string;
  isSimulated: boolean;
  /** ISO date the customer said it (the latest message of the conversation). */
  conversationDate: string;
  transcript: string;
  profileJson: string;
}

export async function extractFutureEvents(ctx: Context): Promise<FutureEventExtraction> {
  const { output } = await generateText({
    model: getModel("analysis"),
    instructions: FUTURE_EVENTS_INSTRUCTIONS,
    prompt: [
      `## Conversation date: ${ctx.conversationDate}`,
      "",
      "## Customer profile (JSON)",
      ctx.profileJson,
      "",
      "## Transcript",
      ctx.transcript,
    ].join("\n"),
    output: Output.object({ schema: futureEventsSchema, name: "future_events" }),
    maxRetries: 2,
  });
  return output;
}

const sameSubject = (a: string | null, b: string | null) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Stores the extracted events of one conversation. An event the customer already mentioned (same
 * kind and person, still waiting) is updated instead of duplicated; events of this conversation
 * the latest extraction no longer supports are withdrawn while nothing has happened with them.
 * Returns the number of rows changed.
 */
export function storeFutureEvents(
  ctx: Pick<Context, "conversationId" | "customerId" | "isSimulated" | "conversationDate">,
  extraction: FutureEventExtraction,
): number {
  const fe = schema.futureEvents;
  let changed = 0;
  db.transaction((tx) => {
    const existing = tx.select().from(fe).where(eq(fe.customerId, ctx.customerId)).all();
    const kept = new Set<string>();
    for (const event of extraction.events.slice(0, MAX_EVENTS)) {
      const resolved = resolveExpression(
        event.expression || event.quote,
        event.timing as Timing,
        ctx.conversationDate,
      );
      if (!resolved || resolved.date <= ctx.conversationDate) continue;
      const values = {
        expectedDate: resolved.date,
        precision: resolved.precision,
        confidence: Math.min(1, Math.max(0, event.confidence)),
        sourceQuote: event.quote.slice(0, 500),
        note: event.note.slice(0, 300),
        conversationId: ctx.conversationId,
      };
      const match = existing.find(
        (e) => e.kind === event.kind && sameSubject(e.subject, event.subject),
      );
      if (match && match.status === "upcoming") {
        tx.update(fe).set(values).where(eq(fe.id, match.id)).run();
        kept.add(match.id);
        changed++;
        continue;
      }
      // Already followed up on: only a new date makes it a new event.
      if (match && match.expectedDate === resolved.date) {
        kept.add(match.id);
        continue;
      }
      const [row] = tx
        .insert(fe)
        .values({
          ...values,
          customerId: ctx.customerId,
          kind: event.kind,
          subject: event.subject?.slice(0, 80) ?? null,
          isSimulated: ctx.isSimulated,
        })
        .returning({ id: fe.id })
        .all();
      kept.add(row.id);
      changed++;
      audit({
        actorType: "ai",
        action: "future_event.created",
        entityType: "future_event",
        entityId: row.id,
        data: { kind: event.kind, expectedDate: resolved.date, conversationId: ctx.conversationId },
      });
    }
    const stale = existing
      .filter(
        (e) =>
          e.conversationId === ctx.conversationId && e.status === "upcoming" && !kept.has(e.id),
      )
      .map((e) => e.id);
    if (stale.length > 0) {
      tx.delete(fe)
        .where(and(inArray(fe.id, stale), eq(fe.status, "upcoming")))
        .run();
      changed += stale.length;
    }
  });
  return changed;
}

/** The day the customer last spoke in the conversation, as the reference for "in zwei Jahren". */
export function conversationDateOf(conversation: {
  createdAt: Date;
  lastMessageAt: Date | null;
}): string {
  return toIsoDate(conversation.lastMessageAt ?? conversation.createdAt);
}
