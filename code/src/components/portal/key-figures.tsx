import { getTranslations } from "next-intl/server";
import { formatChf } from "@/lib/utils";
import type { Figure, KeyFigures as Figures } from "./cockpit";

/** Four numbers that answer "what do I pay and what am I covered for?". */
export async function KeyFigures({ figures, locale }: { figures: Figures; locale: string }) {
  const t = await getTranslations("portal.figures");
  const chf = (value: number) => formatChf(value, locale);
  const premiums: Figure | null =
    figures.premiums > 0 ? { value: figures.premiums, note: "perYear" } : null;
  const tiles = [
    {
      key: "premiums",
      label: t("premiums"),
      figure: premiums,
      note:
        figures.paxPremiums > 0 && figures.paxPremiums < figures.premiums
          ? t("premiumsDetail", { pax: chf(figures.paxPremiums) })
          : null,
    },
    {
      key: "death",
      label: figures.death?.kind === "survivorsPension" ? t("survivors") : t("death"),
      figure: figures.death,
    },
    { key: "disability", label: t("disability"), figure: figures.disability },
    {
      key: "retirement",
      label: t("retirement", { age: figures.retirement?.age ?? 65 }),
      figure: figures.retirement,
    },
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4 lg:rounded-xl">
        {tiles.map(({ key, label, figure, note }) => {
          // A known zero (e.g. no pension fund) reads as a dash with its reason, not "CHF 0".
          const shown = figure && (figure.value > 0 || figure.note !== "noPensionFund");
          return (
            <div key={key} className="flex flex-col bg-surface p-4 lg:p-5">
              <dt className="text-paragraph-xs text-fg-muted">{label}</dt>
              <dd className="mt-1 text-heading-s font-bold tabular-nums">
                {shown ? chf(figure.value) : <span className="text-fg-subtle">–</span>}
              </dd>
              <dd className="text-paragraph-xs text-fg-muted">
                {figure ? (note ?? t(`notes.${figure.note}`)) : t("unknown")}
              </dd>
            </div>
          );
        })}
      </dl>
      {figures.estimated ? (
        <p className="mt-2 text-paragraph-xs text-fg-muted">{t("estimatedFootnote")}</p>
      ) : null}
    </div>
  );
}
