import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Panel } from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import { profileCompleteness } from "@/lib/domain/profile";
import type { ConversationDetail } from "@/lib/firma/conversations";
import { displayName } from "@/lib/firma/names";
import { formatChf } from "@/lib/utils";

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export async function ProfileSection({
  detail,
  locale,
}: {
  detail: ConversationDetail;
  locale: string;
}) {
  const [t, tx] = await Promise.all([
    getTranslations("firma.conversation.profile"),
    getTranslations("firma.taxonomy"),
  ]);
  const { customer, profile } = detail;
  const p = profile.person;
  const year = new Date(detail.conversation.createdAt).getFullYear();
  const chf = (n: number | undefined) => (n === undefined ? null : formatChf(n, locale));
  const completeness = profileCompleteness(profile);

  return (
    <Panel
      title={t("title")}
      actions={
        <Badge tone={customer.lifecycle === "client" ? "success" : "neutral"}>
          {tx(`lifecycle.${customer.lifecycle}`)}
        </Badge>
      }
    >
      <div className="mb-3 grid gap-1">
        <div className="flex justify-between text-xs text-fg-muted">
          <span>{t("completeness")}</span>
          <span className="tabular-nums">{completeness}%</span>
        </div>
        <div className="h-1.5 bg-gray-2">
          <div className="h-full bg-pax-purple" style={{ width: `${completeness}%` }} />
        </div>
      </div>
      <dl className="divide-y divide-gray-2">
        <Row label={t("name")}>{displayName(customer) ?? p.firstName ?? null}</Row>
        <Row label={t("email")}>{customer.email}</Row>
        <Row label={t("phone")}>{customer.phone}</Row>
        <Row label={t("age")}>
          {p.birthYear ? t("ageValue", { age: year - p.birthYear, year: p.birthYear }) : null}
        </Row>
        <Row label={t("maritalStatus")}>
          {p.maritalStatus ? tx(`marital.${p.maritalStatus}`) : null}
        </Row>
        <Row label={t("employment")}>
          {p.employment
            ? `${tx(`employment.${p.employment}`)}${p.workloadPercent !== undefined && p.employment !== "homemaker" ? `, ${p.workloadPercent}%` : ""}`
            : null}
        </Row>
        <Row label={t("income")}>{chf(p.grossIncome)}</Row>
        <Row label={t("partner")}>
          {profile.partner
            ? [
                profile.partner.firstName,
                profile.partner.birthYear ? t("bornIn", { year: profile.partner.birthYear }) : null,
                profile.partner.grossIncome !== undefined ? chf(profile.partner.grossIncome) : null,
              ]
                .filter(Boolean)
                .join(", ")
            : null}
        </Row>
        <Row label={t("children")}>
          {profile.children.length > 0
            ? profile.children.map((c) => t("bornIn", { year: c.birthYear })).join(", ")
            : null}
        </Row>
        <Row label={t("residence")}>
          {[profile.residence.zip, profile.residence.city, profile.residence.canton]
            .filter(Boolean)
            .join(" ") || null}
        </Row>
        <Row label={t("assets")}>{chf(profile.assets.total ?? profile.assets.liquid)}</Row>
        <Row label={t("pillar2")}>
          {profile.pillar2.hasPensionFund === undefined
            ? null
            : profile.pillar2.hasPensionFund
              ? [
                  t("yes"),
                  profile.pillar2.insuredSalary
                    ? t("insuredSalary", { amount: chf(profile.pillar2.insuredSalary) ?? "" })
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ")
              : t("no")}
        </Row>
        <Row label={t("pillar3a")}>
          {[
            profile.pillar3a.balance !== undefined
              ? t("balance", { amount: chf(profile.pillar3a.balance) ?? "" })
              : null,
            profile.pillar3a.annualContribution !== undefined
              ? t("contribution", { amount: chf(profile.pillar3a.annualContribution) ?? "" })
              : null,
          ]
            .filter(Boolean)
            .join(", ") || null}
        </Row>
        <Row label={t("goals")}>
          {profile.goals.length > 0 ? profile.goals.map((g) => tx(`goal.${g}`)).join(", ") : null}
        </Row>
        <Row label={t("concerns")}>
          {profile.concerns.length > 0 ? profile.concerns.join("; ") : null}
        </Row>
        <Row label={t("healthNotes")}>{p.healthNotes}</Row>
      </dl>

      {detail.policies.length > 0 ? (
        <div className="mt-4 grid gap-2">
          <h3 className="text-xs font-medium text-fg-muted">{t("policies")}</h3>
          <ul className="grid gap-2">
            {detail.policies.map((policy) => (
              <li key={policy.id} className="grid gap-0.5 rounded-m bg-gray-1 px-3 py-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{policy.productName}</span>
                  <Badge tone={policy.isExternal ? "warning" : "purple"}>{policy.insurer}</Badge>
                </span>
                <span className="text-xs text-fg-muted">
                  {[
                    tx(`policyCategory.${policy.category}`),
                    policy.premiumAnnual
                      ? `${formatChf(policy.premiumAnnual, locale)} ${t("perYear")}`
                      : null,
                    policy.sumInsured
                      ? t("sumInsured", { amount: formatChf(policy.sumInsured, locale) })
                      : null,
                    policy.endDate ? t("until", { date: policy.endDate }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
