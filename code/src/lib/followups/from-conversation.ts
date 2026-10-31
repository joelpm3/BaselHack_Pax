import "server-only";
import { toIsoDate } from "@/lib/documents/dates";
import { publish } from "@/lib/events/bus";
import { type TranscriptMessage, transcriptForModel } from "@/lib/insights/transcript";
import { getProfile } from "@/lib/profile/service";
import { runFollowUps } from "./engine";
import { conversationDateOf, extractFutureEvents, storeFutureEvents } from "./extract";

/**
 * Post-turn step of the insights pipeline: extracts dated future life events from the
 * conversation, stores them, and lets the follow-up engine react to the customer being back
 * (reopening a lost Wiedervorlage) or to an event that is due within the week.
 */
export async function updateFutureEvents(ctx: {
  conversation: {
    id: string;
    customerId: string;
    isSimulated: boolean;
    createdAt: Date;
    lastMessageAt: Date | null;
  };
  messages: TranscriptMessage[];
}): Promise<void> {
  const { conversation } = ctx;
  // Simulated customers never get emails; extracting their events would only cost tokens.
  if (conversation.isSimulated) return;
  const conversationDate = conversationDateOf(conversation);
  const extraction = await extractFutureEvents({
    conversationId: conversation.id,
    customerId: conversation.customerId,
    isSimulated: conversation.isSimulated,
    conversationDate,
    transcript: transcriptForModel(ctx.messages),
    profileJson: JSON.stringify(getProfile(conversation.customerId)),
  });
  const changed = storeFutureEvents(
    {
      conversationId: conversation.id,
      customerId: conversation.customerId,
      isSimulated: conversation.isSimulated,
      conversationDate,
    },
    extraction,
  );
  if (changed > 0) publish({ type: "analysis.updated", conversationId: conversation.id });
  void runFollowUps({ today: toIsoDate(new Date()), customerId: conversation.customerId }).catch(
    (error) => console.error("[followups] run after analysis failed", error),
  );
}
