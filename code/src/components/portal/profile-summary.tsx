import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { LifeSituation } from "@/lib/domain/profile";
import { formatChf } from "@/lib/utils";
import { EmptyNote } from "./section";

interface Row {
  path: string;
  label: string;
  value: string;
}

/** What Pax knows about the customer, with a marker on values taken from a document. */
export async function ProfileSummary({
  profile,
  documentPaths,
  locale,
}: {
  profile: LifeSituation;
  /** Profile paths whose latest value came from a confirmed document. */
  documentPaths: string[];
  locale: string;
}) {
  const t = await getTranslations("portal.profile");
  const chf = (v: number | undefined) => (v === undefined ? undefined : formatChf(v, locale));
  const fromDocument = new Set(documentPaths);

  const personRows = (prefix: "person" | "partner", p: LifeSituation["person"] | undefined) =>
    p
      ? [
          { path: `${prefix}.firstName`, label: t("firstName"), value: p.firstName },
          {
            path: `${prefix}.birthYear`,
            label: t("birthYear"),
            value: p.birthYear?.toString(),
          },
          {
            path: `${prefix}.maritalStatus`,
            label: t("maritalStatusLabel"),
            value: p.maritalStatus && t(`maritalStatus.${p.maritalStatus}`),
          },
          {
            path: `${prefix}.employment`,
            label: t("employmentLabel"),
            value: p.employment && t(`employment.${p.employment}`),
          },
          {
            path: `${prefix}.workloadPercent`,
            label: t("workload"),
            value: p.workloadPercent === undefined ? undefined : `${p.workloadPercent}%`,
          },
          { path: `${prefix}.grossIncome`, label: t("income"), value: chf(p.grossIncome) },
        ]
      : [];

  const groups: Array<{
    title: string;
    rows: Array<Partial<Row> & { path: string; label: string }>;
  }> = [
    { title: t("you"), rows: personRows("person", profile.person) },
    { title: t("partner"), rows: personRows("partner", profile.partner) },
    {
      title: t("family"),
      rows: [
        {
          path: "children",
          label: t("children"),
          value:
            profile.children.length > 0
              ? t("childrenValue", {
                  count: profile.children.length,
                  years: profile.children.map((c) => c.birthYear).join(", "),
                })
              : undefined,
        },
        {
          path: "residence.city",
          label: t("residence"),
          value:
            [profile.residence.zip, profile.residence.city].filter(Boolean).join(" ") || undefined,
        },
        { path: "assets.total", label: t("assets"), value: chf(profile.assets.total) },
      ],
    },
    {
      title: t("pensionFund"),
      rows: [
        {
          path: "pillar2.insuredSalary",
          label: t("insuredSalary"),
          value: chf(profile.pillar2.insuredSalary),
        },
        {
          path: "pillar2.currentCapital",
          label: t("currentCapital"),
          value: chf(profile.pillar2.currentCapital),
        },
        {
          path: "pillar2.projectedPensionAtRetirement",
          label: t("projectedPension"),
          value: chf(profile.pillar2.projectedPensionAtRetirement),
        },
        { path: "pillar2.maxBuyIn", label: t("maxBuyIn"), value: chf(profile.pillar2.maxBuyIn) },
      ],
    },
    {
      title: t("pillar3a"),
      rows: [
        {
          path: "pillar3a.annualContribution",
          label: t("contribution"),
          value: chf(profile.pillar3a.annualContribution),
        },
        { path: "pillar3a.balance", label: t("balance"), value: chf(profile.pillar3a.balance) },
      ],
    },
  ];

  const filled = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r): r is Row => Boolean(r.value)) }))
    .filter((g) => g.rows.length > 0);
  if (filled.length === 0) return <EmptyNote>{t("empty")}</EmptyNote>;

  return (
    <div className="rounded-xl border border-line p-4 lg:p-5">
      {filled.map((group) => (
        <section key={group.title} className="not-first:mt-4">
          <h3 className="text-paragraph-xs font-medium text-fg-muted">{group.title}</h3>
          <dl className="mt-1 divide-y divide-line">
            {group.rows.map((row) => (
              <div key={row.path} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-paragraph-s text-fg-muted">{row.label}</dt>
                <dd className="flex items-center gap-1.5 text-right text-paragraph-s font-medium tabular-nums">
                  {row.value}
                  {fromDocument.has(row.path) ? (
                    <span title={t("fromDocument")} className="text-contrast-green">
                      <FileText className="size-3.5" aria-hidden />
                      <span className="sr-only">{t("fromDocument")}</span>
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {documentPaths.length > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-paragraph-xs text-fg-muted">
          <FileText className="size-3.5 text-contrast-green" aria-hidden />
          {t("fromDocumentLegend")}
        </p>
      ) : null}
    </div>
  );
}
