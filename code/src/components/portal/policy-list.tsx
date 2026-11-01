import { Download, ExternalLink, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { contractDocumentsFor } from "@/lib/contracts/mapping";
import { formatSwissDate } from "@/lib/documents/dates";
import { formatChf } from "@/lib/utils";
import { groupOf, POLICY_GROUPS, type PolicyRow } from "./cockpit";
import { EmptyNote } from "./section";

type Translate = Awaited<ReturnType<typeof getTranslations<"portal.policies">>>;

interface Figure {
  label: string;
  value: string;
}

const num = (value: unknown) => (typeof value === "number" && value > 0 ? value : null);

function figuresOf(policy: PolicyRow, t: Translate, locale: string): Figure[] {
  const chf = (v: number) => formatChf(v, locale);
  const figures: Figure[] = [];
  const push = (label: string, value: number | null) => {
    if (value !== null) figures.push({ label, value: chf(value) });
  };
  if (policy.category === "pension_fund") {
    push(t("capital"), num(policy.details?.currentCapital));
    push(t("projectedPension"), num(policy.annuityAnnual));
    push(t("disabilityPension"), num(policy.details?.disabilityPension));
    push(t("maxBuyIn"), num(policy.details?.maxBuyIn));
    return figures;
  }
  push(policy.category === "risk_death" ? t("deathSum") : t("sumInsured"), num(policy.sumInsured));
  push(t("annuity"), num(policy.annuityAnnual));
  push(t("premium"), num(policy.premiumAnnual));
  if (policy.endDate)
    figures.push({
      label: t("term"),
      value: policy.startDate
        ? `${formatSwissDate(policy.startDate)} – ${formatSwissDate(policy.endDate)}`
        : t("until", { date: formatSwissDate(policy.endDate) }),
    });
  if (policy.noticeDate)
    figures.push({ label: t("noticeBy"), value: formatSwissDate(policy.noticeDate) });
  return figures;
}

async function PolicyCard({ policy, locale }: { policy: PolicyRow; locale: string }) {
  const t = await getTranslations("portal.policies");
  const tc = await getTranslations("documents.category");
  const figures = figuresOf(policy, t, locale);
  const pdfs = contractDocumentsFor(policy);
  return (
    <article
      className={
        policy.status === "active"
          ? "rounded-xl border border-line p-4 lg:p-5"
          : "rounded-xl border border-dashed border-line-strong p-4 opacity-80 lg:p-5"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-paragraph-xs text-fg-muted">{tc(policy.category)}</p>
          <h4 className="font-bold">{policy.productName}</h4>
          <p className="flex items-center gap-1.5 text-paragraph-s text-fg-muted">
            {policy.isExternal ? null : <span className="size-2 bg-pax-green" aria-hidden />}
            {policy.insurer}
          </p>
          {policy.insuredPerson ? (
            <p className="text-paragraph-xs text-fg-muted">
              {t("insured", { name: policy.insuredPerson })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={policy.isExternal ? "neutral" : "purple"}>
            {policy.isExternal ? t("external") : t("pax")}
          </Badge>
          {policy.status !== "active" ? <Badge>{t(`status.${policy.status}`)}</Badge> : null}
        </div>
      </div>
      {figures.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {figures.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-paragraph-xs text-fg-muted">{f.label}</dt>
              <dd className="text-paragraph-s font-medium tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {policy.documentId && policy.source === "document" ? (
        <a
          href={`/api/documents/${policy.documentId}/file`}
          target="_blank"
          rel="noopener"
          className="mt-4 inline-flex items-center gap-1.5 text-paragraph-xs font-medium text-contrast-green underline-offset-2 hover:underline"
        >
          <FileText className="size-3.5" aria-hidden />
          {t("fromDocument")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
      {pdfs.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-x-5 border-t border-line pt-1">
          {pdfs.map((kind) => (
            <a
              key={kind}
              href={`/api/policies/${policy.id}/${kind}`}
              download
              className="inline-flex min-h-10 items-center gap-1.5 text-paragraph-xs font-medium text-contrast-green underline-offset-2 hover:underline"
            >
              <Download className="size-3.5" aria-hidden />
              {t(`pdf.${kind}`)}
              <span className="sr-only">{` ${t("pdf.product", { product: policy.productName })}`}</span>
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** All contracts, Pax and external, grouped by pillar. Non-life is listed, not analysed. */
export async function PolicyList({ policies, locale }: { policies: PolicyRow[]; locale: string }) {
  const t = await getTranslations("portal.policies");
  if (policies.length === 0) return <EmptyNote>{t("empty")}</EmptyNote>;
  return (
    <div className="flex flex-col gap-6">
      {POLICY_GROUPS.map((group) => {
        const list = policies.filter((p) => groupOf(p) === group);
        if (list.length === 0) return null;
        return (
          <section key={group} aria-label={t(`groups.${group}`)} className="flex flex-col gap-3">
            <h3 className="text-heading-s font-bold">{t(`groups.${group}`)}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((policy) => (
                <PolicyCard key={policy.id} policy={policy} locale={locale} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
