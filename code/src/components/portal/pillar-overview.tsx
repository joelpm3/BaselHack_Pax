import { getTranslations } from "next-intl/server";
import { formatChf } from "@/lib/utils";
import { type AdviceEntry, groupOf, type PolicyGroup, type PolicyRow } from "./cockpit";

/**
 * The cockpit's opening picture: the three pillars (plus non-life) drawn as columns of Pax
 * squares, one square per contract. Green = Pax, outlined = another insurer, dashed = known
 * from the advice but without a contract on file (e.g. the pension fund named in the chat).
 */

const MAX_SQUARES = 8;

const hasSquare = (entry: AdviceEntry | null) => entry !== null && entry.kind !== "noPensionFund";

type Column = "pillar1" | "pillar2" | "pillar3" | "other";
const COLUMN_OF: Record<PolicyGroup, Column> = {
  pillar2: "pillar2",
  pillar3a: "pillar3",
  pillar3b: "pillar3",
  other: "other",
};

/** Squares stack upwards like a pillar; all columns share the height of the tallest one. */
function Squares({
  policies,
  automatic,
  fromAdvice,
  rows,
}: {
  policies: PolicyRow[];
  automatic?: boolean;
  fromAdvice?: boolean;
  rows: number;
}) {
  const shown = policies.slice(0, MAX_SQUARES);
  return (
    <div
      className="flex flex-col-reverse items-start gap-1"
      style={{ height: `calc(${rows} * var(--sq) + ${rows - 1} * 0.25rem)` }}
      aria-hidden
    >
      {automatic ? <span className="size-(--sq) bg-white/25" /> : null}
      {fromAdvice ? <span className="size-(--sq) border-2 border-dashed border-white/80" /> : null}
      {shown.map((p) => (
        <span
          key={p.id}
          className={
            p.isExternal ? "size-(--sq) border-2 border-white" : "size-(--sq) bg-pax-green"
          }
        />
      ))}
      {policies.length > MAX_SQUARES ? (
        <span className="text-paragraph-xs text-white/80">+{policies.length - MAX_SQUARES}</span>
      ) : null}
    </div>
  );
}

export async function PillarOverview({
  locale,
  firstName,
  policies,
  advice,
}: {
  locale: string;
  firstName: string | null;
  policies: PolicyRow[];
  advice: { pillar2: AdviceEntry | null; pillar3: AdviceEntry | null };
}) {
  const t = await getTranslations("portal");
  const active = policies.filter((p) => p.status === "active");
  const byColumn = (column: Column) => active.filter((p) => COLUMN_OF[groupOf(p)] === column);
  const premium = (list: PolicyRow[]) => list.reduce((s, p) => s + (p.premiumAnnual ?? 0), 0);
  const columns: Array<{ id: Column; policies: PolicyRow[]; advice: AdviceEntry | null }> = [
    { id: "pillar1", policies: [], advice: null },
    { id: "pillar2", policies: byColumn("pillar2"), advice: advice.pillar2 },
    { id: "pillar3", policies: byColumn("pillar3"), advice: advice.pillar3 },
    { id: "other", policies: byColumn("other"), advice: null },
  ];
  const squares = (c: (typeof columns)[number]) =>
    Math.min(c.policies.length, MAX_SQUARES) + Number(hasSquare(c.advice));
  const rows = Math.max(2, ...columns.map(squares));
  const adviceText = (entry: AdviceEntry) =>
    "amount" in entry
      ? t(`pillars.advice.${entry.kind}`, { amount: formatChf(entry.amount, locale) })
      : t(`pillars.advice.${entry.kind}`);
  const showLegendAdvice = columns.some((c) => hasSquare(c.advice));

  return (
    <section className="bg-pax-purple text-white" aria-labelledby="cockpit-title">
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-8 lg:px-8 lg:pt-10 lg:pb-12">
        <p className="text-paragraph-s text-white/70">{t("title")}</p>
        <h1 id="cockpit-title" className="mt-1 text-heading-xl font-bold">
          {firstName ? t("greeting", { name: firstName }) : t("greetingAnonymous")}
        </h1>
        <p className="mt-2 max-w-xl text-paragraph-m text-white/80">{t("intro")}</p>

        <div className="mt-8 grid grid-cols-4 gap-3 [--sq:1.25rem] sm:gap-6 sm:[--sq:1.75rem]">
          {columns.map((column) => {
            const sum = premium(column.policies);
            return (
              <div key={column.id} className="flex min-w-0 flex-col">
                <Squares
                  policies={column.policies}
                  automatic={column.id === "pillar1"}
                  fromAdvice={hasSquare(column.advice)}
                  rows={rows}
                />
                <div className="mt-2 border-t border-white/30 pt-2">
                  <p className="text-paragraph-s font-bold">{t(`pillars.${column.id}`)}</p>
                  <p className="text-paragraph-xs text-white/70 max-sm:hidden">
                    {t(`pillars.${column.id}Detail`)}
                  </p>
                  {column.id === "pillar1" ? (
                    <p className="mt-1 text-paragraph-xs text-white/90">{t("pillars.automatic")}</p>
                  ) : null}
                  {column.id !== "pillar1" && (column.policies.length > 0 || !column.advice) ? (
                    <p className="mt-1 text-paragraph-xs text-white/90">
                      {t("pillars.contracts", { count: column.policies.length })}
                    </p>
                  ) : null}
                  {column.advice ? (
                    <p className="mt-1 text-paragraph-xs text-white/90 tabular-nums">
                      {adviceText(column.advice)}
                    </p>
                  ) : null}
                  {sum > 0 ? (
                    <p className="text-paragraph-xs text-white/70 tabular-nums">
                      {t("pillars.premium", { amount: formatChf(sum, locale) })}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-paragraph-xs text-white/80">
          <li className="flex items-center gap-2">
            <span className="size-3 bg-pax-green" aria-hidden />
            {t("pillars.legendPax")}
          </li>
          <li className="flex items-center gap-2">
            <span className="size-3 border-2 border-white" aria-hidden />
            {t("pillars.legendExternal")}
          </li>
          <li className="flex items-center gap-2">
            <span className="size-3 bg-white/25" aria-hidden />
            {t("pillars.legendState")}
          </li>
          {showLegendAdvice ? (
            <li className="flex items-center gap-2">
              <span className="size-3 border-2 border-dashed border-white/80" aria-hidden />
              {t("pillars.legendAdvice")}
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
