import { useFormatter, useTranslations } from "next-intl";
import type { FunnelStage } from "@/lib/domain/taxonomy";
import type { FunnelRow } from "@/lib/firma/aggregate";
import { cn } from "@/lib/utils";

/**
 * Conversations by furthest stage reached, one thin bar per stage (share of all started). The
 * stage most conversations ended at is marked, so the drop-off reads without a second table.
 */
export function Funnel({ rows, dropStage }: { rows: FunnelRow[]; dropStage: FunnelStage | null }) {
  const t = useTranslations("firmaFocus.overview");
  const tStage = useTranslations("common.taxonomy.stages");
  const format = useFormatter();
  if (rows[0].reached === 0) return <p className="text-fg-muted">{t("noConversations")}</p>;

  return (
    <ol aria-label={t("funnelLabel")} className="grid gap-1.5">
      {rows.map((row) => {
        const isDrop = row.stage === dropStage;
        return (
          <li
            key={row.stage}
            className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3"
          >
            <span className={cn("truncate", isDrop ? "font-medium" : "text-fg-muted")}>
              {tStage(row.stage)}
            </span>
            <span className="h-2.5 bg-gray-1">
              <span
                className={cn("block h-full", isDrop ? "bg-warning" : "bg-pax-purple")}
                style={{ width: `${row.shareOfStarted * 100}%` }}
              />
            </span>
            <span
              className="text-right tabular-nums"
              title={format.number(row.shareOfStarted, { style: "percent" })}
            >
              {row.reached}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
