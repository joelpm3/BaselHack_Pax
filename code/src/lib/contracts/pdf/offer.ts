import type { SuitabilityRecord } from "@/lib/sales/types";
import type { Translate } from "../i18n";
import type { OfferDocument, RecommendationReasons } from "../types";
import { chf, createPdf, date, finish, list, type Pdf, paragraph, row, section } from "./blocks";
import {
  conditionsSection,
  coverageSection,
  parties,
  premiumSection,
  termSection,
  withdrawalDeadline,
  zurichDateTime,
} from "./sections";
import { COLOR, PAGE, TYPE, VALUE_WIDTH, VALUE_X } from "./theme";

const MUTED = { color: COLOR.muted };
const QUESTIONS = ["goal", "horizon", "knowledge", "drawdown"] as const;

function why(pdf: Pdf, r: RecommendationReasons): void {
  const { t } = pdf;
  section(pdf, t("contracts.sections.why"), 60);
  const gap = t(`sales.server.gaps.${r.gap}`);
  row(
    pdf,
    t("contracts.why.gap"),
    r.gapAnnual ? t("contracts.why.gapValue", { gap, amount: chf(r.gapAnnual) }) : gap,
  );
  if (r.alsoCloses.length > 0)
    row(
      pdf,
      t("contracts.why.alsoCloses"),
      r.alsoCloses.map((g) => t(`sales.server.gaps.${g}`)).join(", "),
    );
  row(pdf, t("contracts.why.reason"), [
    { text: r.headline, style: { weight: "medium" } },
    { text: r.rationale },
  ]);
  if (r.criteria.length > 0) {
    pdf.canvas.y -= 4;
    r.criteria.forEach((c, i) => {
      row(
        pdf,
        i === 0 ? t("contracts.why.criteria") : "",
        [
          { text: c.criterion, style: { weight: "medium", size: TYPE.small + 0.5 } },
          {
            text: c.met ? c.value : `${c.value} (${t("contracts.why.open")})`,
            style: { size: TYPE.small + 0.5 },
          },
        ],
        c.met ? COLOR.green : "open",
      );
    });
  }
  if (r.alternatives.length > 0) {
    pdf.canvas.y -= 4;
    r.alternatives.forEach((a, i) => {
      row(pdf, i === 0 ? t("contracts.why.alternatives") : "", [
        { text: a.label, style: { weight: "medium", size: TYPE.small + 0.5 } },
        { text: a.reason, style: { size: TYPE.small + 0.5 } },
      ]);
    });
  }
}

function suitability(pdf: Pdf, s: SuitabilityRecord, t: Translate): void {
  section(pdf, t("contracts.sections.suitability"));
  const r = s.result;
  // The result text starts with "Ergebnis:" itself, so it needs no label.
  row(
    pdf,
    "",
    [
      {
        text: t(r.suitable ? "sales.suitability.suitable" : "sales.suitability.notSuitable"),
        style: { weight: "medium" },
      },
    ],
    r.suitable ? COLOR.green : "open",
  );
  row(
    pdf,
    t("contracts.suitability.profile"),
    t("contracts.suitability.profileValue", {
      profile: t(`sales.profiles.${r.profile}`),
      total: r.total,
    }),
  );
  row(pdf, t("contracts.suitability.fund"), s.fund);
  const afford: string[] = [];
  if (s.answers.annualPremium && r.affordability.annual !== null)
    afford.push(
      t(
        r.affordability.annual
          ? "sales.suitability.affordAnnualOk"
          : "sales.suitability.affordAnnualNo",
        {
          amount: chf(s.answers.annualPremium),
        },
      ),
    );
  if (s.answers.singlePremium && r.affordability.single !== null)
    afford.push(
      t(
        r.affordability.single
          ? "sales.suitability.affordSingleOk"
          : "sales.suitability.affordSingleNo",
        {
          amount: chf(s.answers.singlePremium),
        },
      ),
    );
  if (afford.length > 0) row(pdf, t("contracts.suitability.affordability"), afford.join("\n"));
  row(pdf, t("contracts.suitability.completedOn"), zurichDateTime(s.completedAt).date);
  pdf.canvas.y -= 4;
  for (const q of QUESTIONS) {
    row(pdf, t(`sales.suitability.questions.${q}.label`), [
      {
        text: t("contracts.suitability.answerPoints", {
          answer: t(`sales.suitability.questions.${q}.${s.answers[q]}`),
          points: r.points[q],
        }),
        style: { size: TYPE.small + 0.5 },
      },
    ]);
  }
}

function information(pdf: Pdf, d: OfferDocument, signedOn: string): void {
  const { t } = pdf;
  const c = d.coverage;
  section(pdf, t("contracts.sections.information"), 60);
  paragraph(pdf, t("contracts.information.intro"), MUTED);
  pdf.canvas.y -= 2;
  row(pdf, t("contracts.information.insurer"), t("contracts.information.insurerValue"));
  row(
    pdf,
    t("contracts.information.risks"),
    t(`contracts.information.risk.${c.productCode ?? "other"}`),
  );
  row(pdf, t("contracts.information.scope"), t("contracts.information.scopeValue"));
  const premium = [
    c.premiumAnnual
      ? t("contracts.information.premiumAnnual", { amount: chf(c.premiumAnnual, true) })
      : null,
    c.singlePremium
      ? t("contracts.information.premiumSingle", { amount: chf(c.singlePremium, true) })
      : null,
  ].filter((p): p is string => Boolean(p));
  if (premium.length > 0) row(pdf, t("contracts.information.premium"), premium.join(" "));
  if (c.startDate && c.endDate)
    row(
      pdf,
      t("contracts.information.duration"),
      t("contracts.information.durationValue", { start: date(c.startDate), end: date(c.endDate) }),
    );
  row(
    pdf,
    t("contracts.information.withdrawal"),
    t("contracts.information.withdrawalValue", {
      signed: date(signedOn),
      deadline: date(withdrawalDeadline(signedOn)),
    }),
  );
  row(pdf, t("contracts.information.data"), t("contracts.information.dataValue"));
}

function signature(pdf: Pdf, d: OfferDocument): void {
  const { t, canvas: c } = pdf;
  const signed = zurichDateTime(d.signature.signedAt);
  section(pdf, t("contracts.sections.signature"), 90);
  // The typed name, set like a signature above a line.
  c.ensure(40);
  c.y -= 4;
  c.text(d.signature.name, VALUE_X, VALUE_WIDTH, {
    size: 17,
    weight: "medium",
    color: COLOR.deepPurple,
    leading: 1.2,
  });
  c.y -= 3;
  c.hairline(VALUE_X, c.y, Math.min(VALUE_WIDTH, 240), COLOR.lineStrong, 0.8);
  c.y -= 4;
  c.text(t("contracts.signature.methodValue"), VALUE_X, VALUE_WIDTH, {
    size: TYPE.small,
    color: COLOR.muted,
  });
  c.y -= 10;
  row(
    pdf,
    t("contracts.signature.signedAt"),
    t("contracts.signature.signedAtValue", { date: signed.date, time: signed.time }),
  );
  c.y -= 2;
  c.ensure(30);
  const label = t("contracts.signature.confirmed");
  c.textAt(label, PAGE.marginX, c.y - 1.6, PAGE.labelWidth, {
    size: TYPE.small,
    weight: "medium",
    color: COLOR.muted,
  });
  list(
    pdf,
    (["offerRead", "dataCorrect", "demoUnderstood"] as const).map((k) =>
      t(`sales.offer.sign.consents.${k}`),
    ),
  );
  c.y -= 8;
  paragraph(
    pdf,
    d.status === "offer"
      ? t("contracts.approval.inReview", { date: date(d.coverage.startDate) })
      : t("contracts.offer.approved", { date: date(d.coverage.startDate) }),
    { weight: "medium", color: COLOR.deepPurple },
  );
}

export async function renderOffer(d: OfferDocument, t: Translate) {
  const signed = zurichDateTime(d.signature.signedAt);
  const title = t("contracts.offer.title");
  const pdf = await createPdf(
    t,
    { title: `${title} ${d.policyNumber}`, subject: d.coverage.productName, locale: d.locale },
    {
      title,
      subtitle: d.coverage.productName,
      facts: [
        [t("contracts.offer.number"), d.policyNumber],
        [t("contracts.offer.signedOn"), signed.date],
        [t("contracts.offer.status"), t(`contracts.offer.statusValue.${d.status}`)],
      ],
    },
  );
  paragraph(pdf, t("contracts.offer.intro", { name: d.policyholder.name }), {
    size: TYPE.body + 1,
    leading: 1.5,
  });
  parties(pdf, d.policyholder, d.coverage);
  coverageSection(pdf, d.coverage);
  premiumSection(pdf, d.coverage);
  termSection(pdf, d.coverage);
  if (d.recommendation) why(pdf, d.recommendation);
  if (d.suitability) suitability(pdf, d.suitability, t);
  information(pdf, d, signed.isoDate);
  conditionsSection(pdf, d.coverage, "offer");
  signature(pdf, d);
  return {
    bytes: await finish(pdf, `${t("contracts.offer.number")} ${d.policyNumber}`),
    text: pdf.canvas.log,
    filename: t("contracts.offer.filename", { number: d.policyNumber }),
  };
}
