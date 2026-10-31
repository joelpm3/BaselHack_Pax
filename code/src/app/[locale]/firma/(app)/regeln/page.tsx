// One job: edit the active rule set (when Clara hands over, flags or blocks a product) and save
// it as a new version; older versions and accepted drafts are one click away in the side list.
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { LoadingBlock, PageBody, PageHeader } from "@/components/firma/page-parts";
import {
  RestoreVersionButton,
  RuleMarker,
  RuleSummary,
  RulesEditor,
  ruleListClasses,
  ruleRowClasses,
} from "@/components/firma/rules-editor";
import { hrefWith } from "@/components/firma/url";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { PRODUCTS } from "@/lib/domain/products";
import { requireAdvisor } from "@/lib/firma/auth";
import { getRuleSetForEditor } from "@/lib/firma/rules";
import { getProposal, listProposals } from "@/lib/improvements/service";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/regeln">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("rules") };
}

export default function RulesPage({ params, searchParams }: PageProps<"/[locale]/firma/regeln">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.rules");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <RulesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RulesContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const query = await searchParams;
  const requested = Number(query.version);
  const data = getRuleSetForEditor(Number.isInteger(requested) ? requested : null);
  const [t, tAction, tDraft, format] = await Promise.all([
    getTranslations("firma.rules"),
    getTranslations("firma.taxonomy.ruleAction"),
    getTranslations("learning.ruleDraft"),
    getFormatter(),
  ]);
  if (!data) return <PageBody>{t("missing")}</PageBody>;
  const { versions, selected, draft } = data;
  // Accepted improvement proposals wait here as unsaved drafts until someone saves a version.
  const pendingDrafts = listProposals(["accepted"]).filter((p) => p.kind === "rule" && p.rule);
  const proposalId = typeof query.proposal === "string" ? query.proposal : null;
  const proposal = proposalId ? getProposal(proposalId) : undefined;
  const proposalDraft =
    selected.isActive && proposal?.status === "accepted" && proposal.rule
      ? { id: proposal.id, title: proposal.title, rule: { ...proposal.rule, active: true } }
      : null;

  const dateTime = (d: Date) =>
    format.dateTime(d, {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <PageBody className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-12">
      <div className="grid content-start gap-5">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-heading-s font-bold">
              {t("version", { version: selected.version })}
            </h2>
            {selected.isActive ? (
              <Badge tone="success">{t("activeVersion")}</Badge>
            ) : (
              <Badge>{t("archived")}</Badge>
            )}
          </div>
          <p className="text-paragraph-s text-fg-muted">
            {t("createdBy", {
              name: selected.createdBy ?? t("system"),
              time: dateTime(selected.createdAt),
            })}
          </p>
        </div>

        {proposalDraft ? (
          <p className="rounded-m bg-light-purple px-4 py-3 text-deep-purple">
            {tDraft("banner", { title: proposalDraft.title })}
          </p>
        ) : null}
        {selected.isActive ? (
          <RulesEditor
            key={`${selected.id}-${proposalDraft?.id ?? ""}`}
            initial={draft}
            version={selected.version}
            proposal={proposalDraft ?? undefined}
          />
        ) : (
          <div className="grid gap-8">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <RuleSummary rules={draft.rules} />
                <RestoreVersionButton ruleSetId={selected.id} version={selected.version} />
              </div>
              <ol className={ruleListClasses}>
                {draft.rules.map((rule, i) => (
                  <li key={`${i}-${rule.text}`} className={ruleRowClasses}>
                    <RuleMarker n={i + 1} action={rule.action} active={rule.active} />
                    <div className="grid min-w-0 gap-2">
                      <p className={cn("max-w-[68ch]", !rule.active && "text-fg-muted")}>
                        {rule.text}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge>{tAction(rule.action)}</Badge>
                        {rule.productCode ? <Badge>{PRODUCTS[rule.productCode].name}</Badge> : null}
                        {!rule.active ? <Badge>{t("inactive")}</Badge> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <section className="grid max-w-[68ch] gap-2">
              <h3 className="text-paragraph-m font-bold">{t("leadHints")}</h3>
              <p className="whitespace-pre-wrap text-fg-muted">{draft.leadHints || "–"}</p>
            </section>
          </div>
        )}
      </div>

      <aside className="grid content-start gap-8 xl:sticky xl:top-6 xl:self-start">
        {pendingDrafts.length > 0 ? (
          <div className="grid gap-3">
            <h2 className="font-bold">{tDraft("pending")}</h2>
            <ul className="grid gap-2">
              {pendingDrafts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={hrefWith("/firma/regeln", { proposal: p.id })}
                    aria-current={p.id === proposalDraft?.id ? "page" : undefined}
                    className={cn(
                      "grid gap-0.5 rounded-m border border-line px-3 py-2 hover:bg-gray-1",
                      p.id === proposalDraft?.id && "border-pax-purple bg-light-purple",
                    )}
                  >
                    <span className="font-medium">{p.title}</span>
                    <span className="text-paragraph-xs text-fg-muted">{tDraft("openDraft")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid gap-3">
          <h2 className="font-bold">{t("history")}</h2>
          {/* Newest first; the line ties the versions into one history, the filled square is live. */}
          <ol className="grid">
            {versions.map((v, i) => {
              const current = v.id === selected.id;
              return (
                <li key={v.id} className="relative grid grid-cols-[0.875rem_minmax(0,1fr)] gap-x-2">
                  {i < versions.length - 1 ? (
                    <span
                      aria-hidden
                      className="absolute top-5 bottom-0 left-[6.5px] w-px bg-line"
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className={cn(
                      "relative mt-3.5 size-3.5 rounded-[3px] border-[1.5px]",
                      v.isActive ? "border-pax-purple bg-pax-purple" : "border-gray-4 bg-surface",
                    )}
                  />
                  <Link
                    href={hrefWith("/firma/regeln", { version: v.isActive ? null : v.version })}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "mb-1 grid gap-0.5 rounded-m px-3 py-2 hover:bg-gray-1",
                      current && "bg-light-purple hover:bg-light-purple",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{t("version", { version: v.version })}</span>
                      {v.isActive ? <Badge tone="success">{t("activeVersion")}</Badge> : null}
                    </span>
                    <span className="text-paragraph-xs text-fg-muted">
                      {t("createdBy", {
                        name: v.createdBy ?? t("system"),
                        time: format.dateTime(v.createdAt, {
                          day: "numeric",
                          month: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      })}
                    </span>
                    <span className="text-paragraph-xs text-fg-muted">
                      {t("versionStats", {
                        rules: v.ruleCount,
                        conversations: v.conversationCount,
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    </PageBody>
  );
}
