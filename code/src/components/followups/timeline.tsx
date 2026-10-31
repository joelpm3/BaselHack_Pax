import { useTranslations } from "next-intl";
import { addMonths, daysBetween } from "@/lib/documents/dates";
import { displayName } from "@/lib/firma/names";
import type { FutureEventKind } from "@/lib/followups/taxonomy";

export interface TimelineItem {
  id: string;
  followUpOn: string;
  kind: FutureEventKind;
  firstName: string | null;
  lastName: string | null;
}

const MIN_MONTHS = 24;
const MAX_MONTHS = 72;

/**
 * The coming Wiedervorlagen as squares on a time track that starts at (simulated) today, so time
 * travel visibly moves events towards the left edge where they become due.
 */
export function FollowUpTimeline({ today, items }: { today: string; items: TimelineItem[] }) {
  const t = useTranslations("followups");
  const lastDate = items.reduce((max, i) => (i.followUpOn > max ? i.followUpOn : max), today);
  const monthsNeeded = Math.ceil(daysBetween(today, lastDate) / 30.4) + 3;
  const months = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, monthsNeeded));
  const end = addMonths(today, months);
  const span = daysBetween(today, end);
  const position = (date: string) =>
    `${Math.min(100, Math.max(0, (daysBetween(today, date) / span) * 100))}%`;

  const startYear = Number(today.slice(0, 4));
  const years = Array.from(
    { length: Number(end.slice(0, 4)) - startYear },
    (_, i) => `${startYear + i + 1}-01-01`,
  );
  const visible = items.filter((i) => i.followUpOn <= end);

  return (
    <figure className="grid gap-2">
      <figcaption className="text-fg-muted">
        {t("timeline.caption", { count: items.length })}
      </figcaption>
      <div className="relative h-16 rounded-m bg-gray-1">
        <span aria-hidden className="absolute inset-x-3 top-1/2 h-px bg-gray-3" />
        {years.map((y) => (
          <span
            key={y}
            aria-hidden
            className="absolute top-0 bottom-0 border-l border-gray-3"
            style={{ left: position(y) }}
          >
            <span className="absolute bottom-1 left-1 text-xs text-fg-muted tabular-nums">
              {y.slice(0, 4)}
            </span>
          </span>
        ))}
        <span
          aria-hidden
          className="absolute top-1/2 left-0 size-3.5 -translate-y-1/2 bg-pax-green"
          title={t("timeline.today")}
        />
        <ul>
          {visible.map((item) => (
            <li
              key={item.id}
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 bg-pax-purple"
              style={{ left: position(item.followUpOn) }}
              title={`${displayName(item) ?? t("timeline.anonymous")}: ${t(`kind.${item.kind}`)} (${item.followUpOn})`}
            >
              <span className="sr-only">
                {displayName(item) ?? t("timeline.anonymous")}: {t(`kind.${item.kind}`)},{" "}
                {item.followUpOn}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
