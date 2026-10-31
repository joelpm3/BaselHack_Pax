import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type {
  ConversationStatus,
  HandoverStatus,
  LeadStatus,
  LeadType,
  Priority,
  Sentiment,
} from "@/lib/domain/taxonomy";

type Tone = NonNullable<BadgeProps["tone"]>;

const LEAD_TYPE_TONE: Record<LeadType, Tone> = {
  new_business: "purple",
  existing_upsell: "info",
  switch_opportunity: "green",
  service: "neutral",
};

const PRIORITY_TONE: Record<Priority, Tone> = {
  urgent: "error",
  high: "warning",
  medium: "neutral",
  low: "neutral",
};

/** Priority as one coloured square, for dense rows where a badge would be noise. */
export const PRIORITY_MARK: Record<Priority, string> = {
  urgent: "bg-error",
  high: "bg-warning",
  medium: "bg-gray-4",
  low: "bg-gray-3",
};

const CONVERSATION_STATUS_TONE: Record<ConversationStatus, Tone> = {
  active: "success",
  idle: "neutral",
  completed: "info",
  abandoned: "warning",
  handed_over: "purple",
};

const HANDOVER_STATUS_TONE: Record<HandoverStatus, Tone> = {
  open: "warning",
  scheduled: "info",
  done: "success",
  cancelled: "neutral",
};

const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  new: "purple",
  contacted: "info",
  meeting: "info",
  offer: "warning",
  won: "success",
  lost: "neutral",
};

const SENTIMENT_TONE: Record<Sentiment, Tone> = {
  positive: "success",
  neutral: "neutral",
  mixed: "warning",
  negative: "error",
};

export function LeadTypeBadge({ type }: { type: LeadType }) {
  const t = useTranslations("common.taxonomy.leadType");
  return <Badge tone={LEAD_TYPE_TONE[type]}>{t(type)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useTranslations("common.taxonomy.priority");
  return <Badge tone={PRIORITY_TONE[priority]}>{t(priority)}</Badge>;
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const t = useTranslations("common.taxonomy.leadStatus");
  return <Badge tone={LEAD_STATUS_TONE[status]}>{t(status)}</Badge>;
}

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  const t = useTranslations("firma.taxonomy.conversationStatus");
  return <Badge tone={CONVERSATION_STATUS_TONE[status]}>{t(status)}</Badge>;
}

export function HandoverStatusBadge({ status }: { status: HandoverStatus }) {
  const t = useTranslations("firma.taxonomy.handoverStatus");
  return <Badge tone={HANDOVER_STATUS_TONE[status]}>{t(status)}</Badge>;
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const t = useTranslations("common.taxonomy.sentiment");
  return <Badge tone={SENTIMENT_TONE[sentiment]}>{t(sentiment)}</Badge>;
}

export function SimulatedBadge() {
  const t = useTranslations("common");
  return (
    <Badge tone="neutral" className="gap-1">
      <Bot aria-hidden className="size-3" />
      {t("simulated")}
    </Badge>
  );
}
