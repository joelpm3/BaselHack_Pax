import { useFormatter, useTranslations } from "next-intl";
import type { DatePrecision } from "@/lib/followups/taxonomy";

const SEASON_BY_MONTH: Record<number, "spring" | "summer" | "autumn" | "winter"> = {
  3: "spring",
  6: "summer",
  9: "autumn",
  12: "winter",
};

/** A date as loosely as the customer said it: "Sommer 2027", "Oktober 2028", "2030". */
export function EventWhen({ date, precision }: { date: string; precision: DatePrecision }) {
  const t = useTranslations("followups.season");
  const format = useFormatter();
  const value = new Date(`${date}T12:00:00Z`);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  let text: string;
  if (precision === "year") text = String(year);
  else if (precision === "season" && SEASON_BY_MONTH[month])
    text = t(SEASON_BY_MONTH[month], { year });
  else if (precision === "day")
    text = format.dateTime(value, { day: "numeric", month: "long", year: "numeric" });
  else text = format.dateTime(value, { month: "long", year: "numeric" });
  return <time dateTime={date}>{text}</time>;
}

/** Short numeric date for business dates (yyyy-mm-dd strings). */
export function BusinessDate({ date }: { date: string }) {
  const format = useFormatter();
  return (
    <time dateTime={date} className="tabular-nums">
      {format.dateTime(new Date(`${date}T12:00:00Z`), {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      })}
    </time>
  );
}
