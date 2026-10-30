import { getTranslations } from "next-intl/server";
import { formatChf } from "@/lib/utils";
import type { KeyFigures as Figures } from "./cockpit";

/** Four numbers that answer "what do I pay and what am I covered for?". */
export async function KeyFigures({ figures, locale }: { figures: Figures; locale: string }) {
  const t = await getTranslations("portal.figures");
  const chf = (value: number) => formatChf(value, locale);
  const tiles = [
    {
      label: t("premiums"),
      value: figures.premiums,
      note:
        figures.paxPremiums > 0 && figures.paxPremiums < figures.premiums
          ? t("premiumsDetail", { pax: chf(figures.paxPremiums) })
          : t("perYear"),
    },
    { label: t("death"), value: figures.deathCover, note: t("deathNote") },
    { label: t("disability"), value: figures.disabilityPension, note: t("perYear") },
    {
      label: t("retirement", { age: figures.retirementAge }),
      value: figures.retirementPension,
      note: t("perYear"),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line lg:grid-cols-4 lg:rounded-xl">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex flex-col bg-surface p-4 lg:p-5">
          <dt className="text-paragraph-xs text-fg-muted">{tile.label}</dt>
          <dd className="mt-1 text-heading-s font-bold tabular-nums">
            {tile.value > 0 ? chf(tile.value) : <span className="text-fg-subtle">–</span>}
          </dd>
          <dd className="text-paragraph-xs text-fg-muted">
            {tile.value > 0 ? tile.note : t("unknown")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
