import { addDays } from "@/lib/documents/dates";
import type { ScenarioValues } from "@/lib/pricing/types";
import { offerConditionKeys } from "@/lib/sales/conditions";
import type { Coverage, Party } from "../types";
import {
  chf,
  date,
  INSURER,
  list,
  type Part,
  type Pdf,
  paragraph,
  premiumPanel,
  row,
  section,
  type TableRow,
  table,
} from "./blocks";
import { COLOR, TYPE } from "./theme";

const DETAIL = { size: TYPE.small + 0.5, color: COLOR.muted };
const NAME = { weight: "medium" as const };
const SCENARIOS = ["guaranteed", "low", "medium", "high"] as const;

const joined = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(", ");

/** Signing time in Swiss local time: 01.11.2026 and 14:05. */
export function zurichDateTime(iso: string): { date: string; time: string; isoDate: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  return { date: date(isoDate), time: `${parts.hour}:${parts.minute}`, isoDate };
}

/** The last day of the 14-day withdrawal period (VVG Art. 2a) after signing on `isoDate`. */
export const withdrawalDeadline = (isoDate: string) => addDays(isoDate, 14);

export function parties(pdf: Pdf, holder: Party, coverage: Coverage): void {
  const { t } = pdf;
  section(pdf, t("contracts.sections.parties"));
  const born = (d: string | null | undefined) =>
    d ? t("contracts.parties.born", { date: date(d) }) : null;
  const holderParts: Part[] = [{ text: holder.name, style: NAME }];
  const personal = joined(born(holder.birthDate), holder.place);
  if (personal) holderParts.push({ text: personal, style: DETAIL });
  const contact = joined(holder.email, holder.phone);
  if (contact) holderParts.push({ text: contact, style: DETAIL });
  row(pdf, t("contracts.parties.policyholder"), holderParts);

  const insured = coverage.insured;
  const smoker =
    typeof insured.smoker === "boolean"
      ? t("contracts.parties.smoker", { smoker: insured.smoker ? "yes" : "no" })
      : null;
  const insuredDetails = joined(born(insured.birthDate), smoker);
  row(pdf, t("contracts.parties.insured"), [
    { text: insured.name, style: NAME },
    ...(insuredDetails ? [{ text: insuredDetails, style: DETAIL }] : []),
  ]);
  row(pdf, t("contracts.parties.insurer"), [
    { text: INSURER, style: NAME },
    { text: "Aeschenplatz 13, 4002 Basel, www.pax.ch", style: DETAIL },
  ]);
}

/** One row per scenario; the benefit and its date only on the first row of the group. */
function scenarioRows(
  pdf: Pdf,
  benefit: string,
  values: ScenarioValues | undefined,
  unit: (amount: string) => string,
): TableRow[] {
  if (!values) return [];
  const keys = SCENARIOS.filter((key) => typeof values[key] === "number");
  return keys.map((key, i) => ({
    benefit: i === 0 ? benefit : "",
    due: pdf.t(`sales.price.scenario.${key}`),
    amount: unit(chf(values[key] ?? 0)),
    group: benefit,
  }));
}

export function coverageSection(pdf: Pdf, c: Coverage): void {
  const { t } = pdf;
  const end = date(c.endDate);
  const perYear = (amount: string) => t("contracts.cover.perYear", { amount });
  const rows: TableRow[] = [];
  if (c.sumInsured) {
    const death = c.category === "risk_death" || c.category === "care";
    rows.push({
      benefit: t(death ? "contracts.cover.deathCapital" : "contracts.cover.sumInsured"),
      due: death && end ? t("contracts.cover.deathDue", { date: end }) : "",
      amount: chf(c.sumInsured),
    });
  }
  if (c.annualPension) {
    const disability = c.category === "risk_disability";
    rows.push({
      benefit: t(disability ? "contracts.cover.pension" : "contracts.cover.annuity"),
      due: !end
        ? ""
        : disability && c.waitingPeriodMonths
          ? t("contracts.cover.pensionDue", { months: c.waitingPeriodMonths, date: end })
          : t("contracts.cover.pensionDueNoWaiting", { date: end }),
      amount: perYear(chf(c.annualPension)),
    });
  }
  rows.push(
    ...scenarioRows(
      pdf,
      [t("contracts.cover.maturity"), end && t("contracts.cover.maturityDue", { date: end })]
        .filter(Boolean)
        .join(" "),
      c.maturity,
      (a) => a,
    ),
    ...scenarioRows(
      pdf,
      [t("contracts.cover.payout"), end && t("contracts.cover.payoutDue", { date: end })]
        .filter(Boolean)
        .join(" "),
      c.payoutAnnual,
      perYear,
    ),
  );
  for (const rider of c.riders) {
    const known = rider.code && ["I", "PFZ", "IR"].includes(rider.code);
    rows.push({
      benefit: known ? t(`sales.riders.${rider.code}`) : rider.name,
      due: t("contracts.cover.rider"),
      amount:
        rider.premiumAnnual > 0
          ? perYear(chf(rider.premiumAnnual, true))
          : t("contracts.cover.included"),
    });
  }

  section(pdf, t("contracts.sections.cover"));
  row(pdf, t("contracts.cover.product"), [
    { text: c.productName, style: NAME },
    ...(c.pillar ? [{ text: t(`sales.cover.pillar${c.pillar}`), style: DETAIL }] : []),
  ]);
  if (c.fund) row(pdf, t("contracts.cover.fund"), c.fund);
  if (c.guaranteedSharePercent)
    row(pdf, t("contracts.cover.guaranteedShare"), `${c.guaranteedSharePercent} %`);
  if (rows.length > 0) {
    pdf.canvas.y -= 6;
    table(
      pdf,
      {
        benefit: t("contracts.cover.benefit"),
        due: t("contracts.cover.due"),
        amount: t("contracts.cover.amount"),
      },
      rows,
    );
  }
  if (c.maturity || c.payoutAnnual) paragraph(pdf, t("sales.price.scenarioNote"), DETAIL);
}

export function premiumSection(pdf: Pdf, c: Coverage): void {
  const { t } = pdf;
  const figures = [];
  if (c.premiumAnnual)
    figures.push({ amount: chf(c.premiumAnnual, true), unit: t("contracts.premium.perYear") });
  if (c.singlePremium)
    figures.push({ amount: chf(c.singlePremium, true), unit: t("contracts.premium.once") });
  if (figures.length === 0) return;
  const details: Array<[string, string]> = [
    [
      t("contracts.premium.frequency"),
      c.premiumAnnual ? t("contracts.premium.annually") : t("contracts.premium.once"),
    ],
  ];
  if (c.premiumAnnual && c.premiumNet && c.premiumNet < c.premiumAnnual - 0.5)
    details.push([
      t("contracts.premium.net"),
      t("contracts.premium.netValue", { amount: chf(c.premiumNet, true) }),
    ]);
  if (c.priceSource)
    details.push([
      t("contracts.premium.source"),
      t(c.priceSource === "quicksale" ? "sales.price.labelQuicksale" : "sales.price.labelEstimate"),
    ]);
  section(pdf, t("contracts.sections.premium"), 80);
  premiumPanel(pdf, t("contracts.premium.label"), figures, details);
}

export function termSection(pdf: Pdf, c: Coverage): void {
  const { t } = pdf;
  if (!c.startDate && !c.endDate) return;
  section(pdf, t("contracts.sections.term"));
  if (c.startDate) row(pdf, t("contracts.term.start"), date(c.startDate));
  if (c.endDate) row(pdf, t("contracts.term.end"), date(c.endDate));
  if (c.durationYears)
    row(
      pdf,
      t("contracts.term.duration"),
      c.endAge
        ? t("contracts.term.yearsToAge", { years: c.durationYears, endAge: c.endAge })
        : t("contracts.term.years", { years: c.durationYears }),
    );
}

/** Only before the contract: the withdrawal right and the health questions of a real Antrag. */
const OFFER_ONLY = new Set(["withdrawal", "health"]);

export function conditionsSection(pdf: Pdf, c: Coverage, stage: "offer" | "policy"): void {
  if (!c.productCode) return;
  const { t } = pdf;
  const keys = offerConditionKeys(c.productCode, c.pillar).filter(
    (k) => stage === "offer" || !OFFER_ONLY.has(k),
  );
  section(pdf, t("contracts.sections.conditions"));
  list(
    pdf,
    keys.map((k) => t(`sales.offer.conditions.${k}`)),
  );
}
