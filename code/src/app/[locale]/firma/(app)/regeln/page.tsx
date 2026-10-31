// One job: edit the active rule set (when Clara hands over, flags or blocks a product) and save
// it as a new version; older versions and accepted drafts are one click away in the side list.
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { LoadingBlock, PageBody, PageHeader, Panel } from "@/components/firma/page-parts";
import { RestoreVersionButton, RulesEditor } from "@/components/firma/rules-editor";
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

  return (
    <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-paragraph-l font-bold">
            {t("version", { version: selected.version })}
          </h2>
          {selected.isActive ? (
            <Badge tone="success">{t("activeVersion")}</Badge>
          ) : (
            <Badge>{t("archived")}</Badge>
          )}
          <span className="text-fg-muted">
            {t("createdBy", {
              name: selected.createdBy ?? t("system"),
              time: format.dateTime(selected.createdAt, {
                day: "numeric",
                month: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </span>
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
          <div className="grid gap-4">
            <RestoreVersionButton ruleSetId={selected.id} version={selected.version} />
            <ol className="grid gap-3">
              {draft.rules.map((rule, i) => (
                <li
                  key={`${i}-${rule.text}`}
                  className={cn(
                    "grid gap-2 rounded-xl border border-line p-4 md:grid-cols-[2rem_minmax(0,1fr)_12rem]",
                    !rule.active && "bg-gray-1 text-fg-muted",
                  )}
                >
                  <span className="text-paragraph-l font-bold text-fg-muted tabular-nums">
                    {i + 1}
                  </span>
                  <p>{rule.text}</p>
                  <div className="flex flex-wrap content-start gap-1.5">
                    <Badge tone="info">{tAction(rule.action)}</Badge>
                    {rule.productCode ? <Badge>{PRODUCTS[rule.productCode].name}</Badge> : null}
                    {!rule.active ? <Badge>{t("inactive")}</Badge> : null}
                  </div>
                </li>
              ))}
            </ol>
            <Panel title={t("leadHints")}>
              <p className="whitespace-pre-wrap">{draft.leadHints || "–"}</p>
            </Panel>
          </div>
        )}
      </div>

      <aside className="grid content-start gap-3">
        {pendingDrafts.length > 0 ? (
          <div className="mb-3 grid gap-2">
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
        <h2 className="font-bold">{t("history")}</h2>
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-gray-2">
          {versions.map((v) => (
            <li key={v.id}>
              <Link
                href={hrefWith("/firma/regeln", { version: v.isActive ? null : v.version })}
                aria-current={v.id === selected.id ? "page" : undefined}
                className={cn(
                  "grid gap-0.5 bg-surface px-4 py-3 hover:bg-gray-1",
                  v.id === selected.id && "bg-light-purple hover:bg-light-purple",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t("version", { version: v.version })}</span>
                  {v.isActive ? <Badge tone="success">{t("activeVersion")}</Badge> : null}
                </span>
                <span className="text-paragraph-xs text-fg-muted">
                  {v.createdBy ?? t("system")} ·{" "}
                  {format.dateTime(v.createdAt, {
                    day: "numeric",
                    month: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-paragraph-xs text-fg-muted">
                  {t("versionStats", { rules: v.ruleCount, conversations: v.conversationCount })}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </aside>
    </PageBody>
  );
}
