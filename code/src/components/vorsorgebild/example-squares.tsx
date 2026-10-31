import { useTranslations } from "next-intl";
import type { IncomeBreakdown } from "@/lib/advisor/types";
import { cn } from "@/lib/utils";
import { buildSquares, SOURCES } from "./grid";
import { LegendSquare, SQUARE_FILL } from "./square-style";

/** Illustrative household: CHF 150'000 income, need 80% (CHF 10'000 a month), gap CHF 2'500. */
const EXAMPLE: IncomeBreakdown = {
  grossIncome: 150000,
  need: 120000,
  pillar1: 30000,
  pillar2: 48000,
  other: 12000,
  partner: 0,
  policies: 0,
  total: 90000,
  gap: 30000,
  surplus: 0,
  capitalGap: 0,
};

/** The home page's preview of the Vorsorgebild: what one looks like, explained in one line. */
export function ExampleSquares() {
  const t = useTranslations("home.example");
  const squares = buildSquares(EXAMPLE);
  return (
    <figure className="rounded-xl bg-surface-muted p-6 sm:p-8 lg:rounded-xl">
      <div aria-hidden className="grid w-max grid-cols-5 gap-2 sm:gap-2.5 lg:gap-3">
        {squares.map((square, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: positional squares
            key={i}
            className={cn("block size-9 border-2 sm:size-11 lg:size-14", SQUARE_FILL[square.kind])}
          />
        ))}
      </div>
      <figcaption className="mt-6">
        <p className="text-paragraph-s font-bold">{t("caption")}</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-paragraph-xs text-fg-muted">
          {SOURCES.filter((s) => EXAMPLE[s] > 0).map((source) => (
            <li key={source} className="flex items-center gap-2">
              <LegendSquare kind={source} />
              {t(`sources.${source}`)}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <LegendSquare kind="gap" />
            {t("gap")}
          </li>
        </ul>
        <p className="mt-3 text-paragraph-xs text-fg-muted">{t("unit")}</p>
      </figcaption>
    </figure>
  );
}
