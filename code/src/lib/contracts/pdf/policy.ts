import type { Translate } from "../i18n";
import type { PolicyDocument } from "../types";
import { createPdf, date, finish, list, paragraph, row, section } from "./blocks";
import {
  conditionsSection,
  coverageSection,
  parties,
  premiumSection,
  termSection,
  zurichDateTime,
} from "./sections";
import { TYPE } from "./theme";

export async function renderPolicy(d: PolicyDocument, t: Translate) {
  const title = t("contracts.policy.title");
  const pdf = await createPdf(
    t,
    { title: `${title} ${d.policyNumber}`, subject: d.coverage.productName, locale: d.locale },
    {
      title,
      subtitle: d.coverage.productName,
      facts: [
        [t("contracts.policy.number"), d.policyNumber],
        [t("contracts.policy.validFrom"), date(d.coverage.startDate) || "–"],
        [t("contracts.policy.status"), t(`contracts.policy.statusValue.${d.status}`)],
      ],
    },
  );
  paragraph(pdf, t("contracts.policy.intro", { name: d.policyholder.name }), {
    size: TYPE.body + 1,
  });
  parties(pdf, d.policyholder, d.coverage);
  coverageSection(pdf, d.coverage);
  premiumSection(pdf, d.coverage);
  termSection(pdf, d.coverage);
  if (d.beneficiaries.length > 0) {
    section(pdf, t("contracts.sections.beneficiaries"));
    list(pdf, d.beneficiaries);
  }
  conditionsSection(pdf, d.coverage, "policy");

  section(pdf, t("contracts.sections.approval"), 70);
  if (d.approval?.approvedAt) {
    const approved = zurichDateTime(d.approval.approvedAt).date;
    row(
      pdf,
      t("contracts.approval.approved"),
      d.approval.advisorName
        ? t("contracts.approval.approvedValue", { name: d.approval.advisorName, date: approved })
        : t("contracts.approval.approvedValueNoName", { date: approved }),
    );
  }
  if (d.signature)
    row(
      pdf,
      t("contracts.approval.signed"),
      t("contracts.approval.signedValue", {
        name: d.signature.name,
        date: zurichDateTime(d.signature.signedAt).date,
      }),
    );
  row(pdf, t("contracts.approval.issued"), date(d.issuedOn));

  return {
    bytes: await finish(pdf, `${t("contracts.policy.number")} ${d.policyNumber}`),
    text: pdf.canvas.log,
    filename: t("contracts.policy.filename", { number: d.policyNumber }),
  };
}
