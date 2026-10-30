import { useFormatter, useTranslations } from "next-intl";
import type { FunnelRow } from "@/lib/firma/aggregate";
import { CHART_COLORS } from "./charts";

/**
 * Conversations by furthest stage reached. Bar = share of all started conversations; the
 * drop-off column says how many of the previous stage did not get this far, and how many
 * customers left the chat at exactly this stage.
 */
export function Funnel({ rows }: { rows: FunnelRow[] }) {
  const t = useTranslations("firma.overview.funnel");
  const tStage = useTranslations("common.taxonomy.stages");
  const format = useFormatter();
  const pct = (v: number) => format.number(v, { style: "percent", maximumFractionDigits: 0 });

  if (rows[0].reached === 0) return <p className="py-4 text-fg-muted">{t("empty")}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="text-left text-xs text-fg-muted">
            <th scope="col" className="w-40 pb-2 font-normal">
              {t("stage")}
            </th>
            <th scope="col" className="pb-2 font-normal">
              {t("reached")}
            </th>
            <th scope="col" className="w-20 pb-2 text-right font-normal">
              {t("dropOff")}
            </th>
            <th scope="col" className="w-28 pb-2 text-right font-normal">
              {t("leftHere")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.stage} className="border-t border-gray-2">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {tStage(row.stage)}
              </th>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 bg-gray-1">
                    <div
                      className="h-full rounded-r-[4px]"
                      style={{ width: `${row.shareOfStarted * 100}%`, background: CHART_COLORS[1] }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    <span className="font-medium">{row.reached}</span>{" "}
                    <span className="text-fg-muted">{pct(row.shareOfStarted)}</span>
                  </span>
                </div>
              </td>
              <td className="py-1.5 text-right tabular-nums text-fg-muted">
                {row.dropOff > 0 ? `−${pct(row.dropOff)}` : "–"}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {row.abandonedHere > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 bg-warning" />
                    {row.abandonedHere}
                  </span>
                ) : (
                  <span className="text-fg-subtle">–</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
