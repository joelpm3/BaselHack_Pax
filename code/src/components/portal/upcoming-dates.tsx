import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { daysBetween, formatSwissDate } from "@/lib/documents/dates";
import type { UpcomingDate } from "./cockpit";
import { EmptyNote } from "./section";

const SOON_DAYS = 60;

/** Notice deadlines and contract ends, soonest first. */
export async function UpcomingDates({ dates, today }: { dates: UpcomingDate[]; today: string }) {
  const t = await getTranslations("portal.dates");
  if (dates.length === 0) return <EmptyNote>{t("empty")}</EmptyNote>;
  return (
    <ol className="divide-y divide-line rounded-xl border border-line">
      {dates.map((d) => {
        const days = daysBetween(today, d.date);
        const [day, month, year] = formatSwissDate(d.date).split(".");
        return (
          <li key={`${d.policyId}-${d.kind}`} className="flex gap-4 p-4">
            <time dateTime={d.date} className="w-14 shrink-0">
              <span className="block text-heading-s font-bold tabular-nums">
                {day}.{month}.
              </span>
              <span className="block text-paragraph-xs text-fg-muted tabular-nums">{year}</span>
            </time>
            <div className="min-w-0">
              <p className="font-medium">{t(d.kind)}</p>
              <p className="text-paragraph-s text-fg-muted">
                {t("contract", { product: d.productName, insurer: d.insurer })}
              </p>
              <Badge tone={days <= SOON_DAYS ? "warning" : "neutral"} className="mt-1.5">
                {t("inDays", { days })}
              </Badge>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
