import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { AutoRefresh } from "@/components/firma/auto-refresh";
import {
  ProposalDecision,
  ReopenProposalButton,
  RunAnalysisButtons,
} from "@/components/firma/improvements/improvement-controls";
import {
  EmptyState,
  LoadingBlock,
  PageBody,
  PageHeader,
  Panel,
} from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { PRODUCTS, type ProductCode } from "@/lib/domain/products";
import { requireAdvisor } from "@/lib/firma/auth";
import { STALE_RUN_MS } from "@/lib/improvements/analyze";
import type { ImprovementStats } from "@/lib/improvements/digest";
import {
  conversationTitles,
  type ImprovementProposal,
  type ImprovementRun,
  listOpenFlags,
  listProposals,
  listRuns,
} from "@/lib/improvements/service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/verbesserungen">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("improvements") };
}

export default function ImprovementsPage({ params }: PageProps<"/[locale]/firma/verbesserungen">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("learning.improvements");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <ImprovementsContent />
      </Suspense>
    </>
  );
}

const dateTime = {
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

async function ImprovementsContent() {
  await requireAdvisor();
  await connection();
  const [runs, open, decided, flags] = [
    listRuns(1),
    listProposals(["open"]),
    listProposals(["accepted", "applied", "dismissed"]),
    listOpenFlags(),
  ];
  // A run that outlived the server (restart mid-analysis) no longer blocks a new one.
  const latest = runs[0] ?? null;
  const running =
    latest?.status === "running" && Date.now() - latest.startedAt.getTime() < STALE_RUN_MS;
  const titles = conversationTitles(
    [...open, ...decided].flatMap((p) => p.evidence.map((e) => e.conversationId)),
  );
  const [t, format] = await Promise.all([getTranslations("learning.improvements"), getFormatter()]);

  return (
    <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <AutoRefresh active={running} intervalMs={3000} />
      <div className="grid content-start gap-6">
        <section className="grid gap-4 rounded-xl border border-line p-5">
          <RunAnalysisButtons running={running && latest ? latest.window : null} />
          <RunStatus run={latest} running={running} />
        </section>

        <section className="grid gap-3" aria-labelledby="open-proposals">
          <h2 id="open-proposals" className="text-lg font-bold">
            {t("open")} <span className="font-normal text-fg-muted">{open.length}</span>
          </h2>
          {open.length === 0 ? (
            <EmptyState title={t("openEmpty")} />
          ) : (
            <ol className="grid gap-4">
              {open.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} titles={titles} />
              ))}
            </ol>
          )}
        </section>

        {decided.length > 0 ? (
          <section className="grid gap-3" aria-labelledby="decided-proposals">
            <h2 id="decided-proposals" className="text-lg font-bold">
              {t("accepted")} / {t("dismissed")}
            </h2>
            <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-gray-2">
              {decided.map((proposal) => (
                <DecidedRow key={proposal.id} proposal={proposal} />
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <aside className="grid content-start gap-6">
        <Panel title={t("flags.title")} description={t("flags.description")}>
          {flags.length === 0 ? (
            <p className="text-fg-muted">{t("flags.empty")}</p>
          ) : (
            <ul className="grid gap-3">
              {flags.map((flag) => (
                <li key={flag.id} className="grid gap-0.5 border-l-2 border-error pl-3">
                  <Link
                    href={`/firma/gespraeche/${flag.conversationId}`}
                    className="font-medium text-pax-purple hover:underline"
                  >
                    {flag.conversationTitle ?? t("untitled")}
                  </Link>
                  <p>{flag.note}</p>
                  <p className="text-xs text-fg-muted">
                    {t("flags.by", {
                      name: flag.advisorName ?? "–",
                      time: format.dateTime(flag.createdAt, dateTime),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>
    </PageBody>
  );
}

async function RunStatus({ run, running }: { run: ImprovementRun | null; running: boolean }) {
  const [t, format] = await Promise.all([getTranslations("learning.improvements"), getFormatter()]);
  if (!run) return <p className="text-fg-muted">{t("noRun")}</p>;
  const window = t(`window.${run.window}`);
  if (run.status === "running")
    return running ? (
      <p aria-live="polite">{t("running", { window })}</p>
    ) : (
      <p className="text-error-dark">{t("interrupted")}</p>
    );
  if (run.status === "failed")
    return <p className="text-error-dark">{t("failed", { error: run.error ?? "" })}</p>;

  const stats = run.stats as ImprovementStats | null;
  return (
    <div className="grid gap-4">
      <p className="text-fg-muted">
        {t("lastRun", { window, time: format.dateTime(run.finishedAt ?? run.startedAt, dateTime) })}
      </p>
      {run.conversationCount === 0 || !stats ? (
        <p>{t("noConversations")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              value={String(stats.conversations)}
              label={t("stats.conversations")}
              note={stats.simulated ? t("stats.simulated", { count: stats.simulated }) : null}
            />
            <Stat value={String(stats.droppedBeforeRecommendation)} label={t("stats.dropped")} />
            <Stat
              value={stats.npsAverage === null ? "–" : format.number(stats.npsAverage)}
              label={t("stats.nps")}
              note={t("stats.npsCount", { count: stats.npsCount })}
            />
            <Stat value={String(stats.flagged)} label={t("stats.flagged")} />
            <Stat value={String(stats.missedHandovers)} label={t("stats.missedHandovers")} />
          </dl>
          {run.summary ? <p className="max-w-3xl">{run.summary}</p> : null}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note?: string | null }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="order-2 text-fg-muted">{label}</dt>
      <dd className="order-1 text-2xl font-bold tabular-nums">{value}</dd>
      {note ? <dd className="order-3 text-xs text-fg-muted">{note}</dd> : null}
    </div>
  );
}

async function ProposalCard({
  proposal,
  titles,
}: {
  proposal: ImprovementProposal;
  titles: Map<string, string | null>;
}) {
  const [t, tAction] = await Promise.all([
    getTranslations("learning.improvements"),
    getTranslations("firma.taxonomy.ruleAction"),
  ]);
  return (
    <li className="grid gap-4 rounded-xl border border-line p-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="warning">{t(`category.${proposal.category}`)}</Badge>
          <Badge tone="info">{t(`kind.${proposal.kind}`)}</Badge>
        </div>
        <h3 className="text-base font-bold">{proposal.title}</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-1">
          <p className="font-medium">{t("problem")}</p>
          <p className="text-fg-muted">{proposal.problem}</p>
        </div>
        <div className="grid content-start gap-1">
          <p className="font-medium">{t("proposal")}</p>
          <p>{proposal.proposal}</p>
        </div>
      </div>
      {proposal.rule ? (
        <figure className="grid gap-2 rounded-m bg-light-purple px-4 py-3">
          <figcaption className="flex flex-wrap items-center gap-2 font-medium text-deep-purple">
            {t("ruleDraft")}
            <Badge tone="purple">{tAction(proposal.rule.action)}</Badge>
            {proposal.rule.productCode ? (
              <Badge>{PRODUCTS[proposal.rule.productCode as ProductCode]?.name}</Badge>
            ) : null}
          </figcaption>
          <blockquote>{proposal.rule.text}</blockquote>
        </figure>
      ) : null}
      <Evidence proposal={proposal} titles={titles} />
      <ProposalDecision proposalId={proposal.id} kind={proposal.kind} />
    </li>
  );
}

/** One square per conversation the problem was seen in, each a link to that conversation. */
async function Evidence({
  proposal,
  titles,
}: {
  proposal: ImprovementProposal;
  titles: Map<string, string | null>;
}) {
  const t = await getTranslations("learning.improvements");
  return (
    <details className="group grid gap-2">
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex flex-wrap gap-1">
          {proposal.evidence.map((e) => (
            <span key={e.conversationId} className="block size-3 bg-pax-purple" />
          ))}
        </span>
        <span className="font-medium text-pax-purple group-open:underline">
          {t("evidence", { count: proposal.occurrences })}
        </span>
      </summary>
      <ul className="mt-2 grid gap-2">
        {proposal.evidence.map((e) => (
          <li key={e.conversationId} className="grid gap-0.5 border-l-2 border-line pl-3">
            <Link
              href={`/firma/gespraeche/${e.conversationId}`}
              className="font-medium text-pax-purple hover:underline"
            >
              {titles.get(e.conversationId) ?? t("untitled")}
            </Link>
            <p className="text-fg-muted">{e.note}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

async function DecidedRow({ proposal }: { proposal: ImprovementProposal }) {
  const t = await getTranslations("learning.improvements");
  return (
    <li className="grid gap-2 bg-surface px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              proposal.status === "applied"
                ? "success"
                : proposal.status === "accepted"
                  ? "info"
                  : "neutral"
            }
          >
            {t(proposal.status === "open" ? "open" : proposal.status)}
          </Badge>
          <span className="font-medium">{proposal.title}</span>
        </div>
        <p className="text-fg-muted">
          {proposal.status === "applied"
            ? t("appliedIn", { version: proposal.appliedRuleSetVersion ?? 0 })
            : proposal.status === "accepted"
              ? proposal.kind === "rule"
                ? t("acceptedRule")
                : proposal.kind === "knowledge"
                  ? t("acceptedKnowledge")
                  : t("acceptedPrompt")
              : t(`kind.${proposal.kind}`)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {proposal.status === "accepted" && proposal.kind === "rule" ? (
          <Link
            href={`/firma/regeln?proposal=${proposal.id}`}
            className="rounded-m px-2.5 py-1.5 font-medium text-pax-purple hover:bg-gray-1"
          >
            {t("reviewInEditor")}
          </Link>
        ) : null}
        {proposal.status === "accepted" && proposal.kind === "knowledge" ? (
          <Link
            href="/firma/wissen"
            className="rounded-m px-2.5 py-1.5 font-medium text-pax-purple hover:bg-gray-1"
          >
            {t("openKnowledge")}
          </Link>
        ) : null}
        {proposal.status !== "applied" ? <ReopenProposalButton proposalId={proposal.id} /> : null}
      </div>
    </li>
  );
}
