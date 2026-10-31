import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { ConversationStatusBadge } from "@/components/firma/badges";
import { CustomerLabel } from "@/components/firma/customer-label";
import { LiveRefresh, LiveStatus } from "@/components/firma/live-events";
import {
  EmptyState,
  LoadingBlock,
  PageBody,
  PageHeader,
  Panel,
} from "@/components/firma/page-parts";
import { CancelSimulationButton, SimulationForm } from "@/components/firma/simulation-controls";
import { StageSquares } from "@/components/firma/stage-squares";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requireAdvisor } from "@/lib/firma/auth";
import { SIMULATION_LIMITS } from "@/lib/simulation/engine";
import { listSimulationRuns, type SimulationRunItem } from "@/lib/simulation/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/simulation">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("simulation") };
}

export default function SimulationPage({ params }: PageProps<"/[locale]/firma/simulation">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.simulation");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<LiveStatus />} />
      <PageBody className="grid gap-6">
        <Panel
          title={t("form.title")}
          description={t("form.description", { maxTurns: SIMULATION_LIMITS.maxTurns })}
        >
          <SimulationForm limits={SIMULATION_LIMITS} />
        </Panel>
        <Suspense fallback={<LoadingBlock label={t("title")} />}>
          <Runs />
        </Suspense>
      </PageBody>
    </>
  );
}

const RUN_TONE = {
  running: "info",
  completed: "success",
  failed: "error",
  cancelled: "neutral",
} as const;

async function Runs() {
  await requireAdvisor();
  await connection();
  const runs = listSimulationRuns();
  const t = await getTranslations("firma.simulation");
  return (
    <section className="grid gap-4">
      <LiveRefresh types={["simulation", "conversation", "analysis"]} intervalMs={1500} />
      <h2 className="text-paragraph-l font-bold">{t("runs")}</h2>
      {runs.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : (
        runs.map((run) => <RunCard key={run.id} run={run} />)
      )}
    </section>
  );
}

async function RunCard({ run }: { run: SimulationRunItem }) {
  const [t, tStage, tConcern, format] = await Promise.all([
    getTranslations("firma.simulation"),
    getTranslations("common.taxonomy.stages"),
    getTranslations("firma.simulation.concern"),
    getFormatter(),
  ]);
  const stats = run.stats;
  const done = stats?.done ?? 0;
  const mix = (run.personaMix ?? {}) as {
    locales?: Record<string, number>;
    concerns?: Record<string, number>;
    material?: number;
    earlyLeavers?: number;
  };
  const progress = run.size > 0 ? done / run.size : 0;

  return (
    <article className="grid gap-4 rounded-xl border border-line p-5">
      <header className="flex flex-wrap items-center gap-3">
        <Badge tone={RUN_TONE[run.status]}>{t(`status.${run.status}`)}</Badge>
        <span className="font-medium">
          {t("runTitle", {
            time: format.dateTime(run.startedAt, {
              day: "numeric",
              month: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
        </span>
        <span className="text-fg-muted">
          {t("startedBy", { name: run.startedBy ?? t("system") })}
        </span>
        {run.status === "running" ? (
          <span className="ml-auto">
            <CancelSimulationButton runId={run.id} />
          </span>
        ) : null}
      </header>

      <div className="grid gap-1.5">
        <div className="flex flex-wrap justify-between gap-2">
          <span>{t("progress", { done, size: run.size })}</span>
          <span className="text-fg-muted">
            {t("outcomes", {
              completed: stats?.completed ?? 0,
              abandoned: stats?.abandoned ?? 0,
              failed: stats?.failed ?? 0,
              turns: stats?.turns ?? 0,
            })}
          </span>
        </div>
        <div
          className="h-2 bg-gray-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={run.size}
          aria-valuenow={done}
        >
          <div
            className="h-full bg-pax-green transition-[width]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <p className="text-fg-muted">
        {t("mix", {
          material: mix.material ?? 0,
          concurrency: run.concurrency,
          earlyLeavers: mix.earlyLeavers ?? 0,
        })}{" "}
        {mix.locales
          ? Object.entries(mix.locales)
              .map(([locale, n]) => `${locale.toUpperCase()} ${n}`)
              .join(", ")
          : null}
      </p>
      {mix.concerns ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(mix.concerns).map(([concern, n]) => (
            <Badge key={concern}>
              {tConcern.has(concern) ? tConcern(concern) : concern} {n}
            </Badge>
          ))}
        </div>
      ) : null}

      {stats?.errors?.length ? (
        <details className="rounded-m bg-error-light px-3 py-2 text-error-dark">
          <summary className="cursor-pointer">
            {t("errors", { count: stats.errors.length })}
          </summary>
          <ul className="mt-2 grid gap-1 text-paragraph-xs">
            {stats.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {run.conversations.length > 0 ? (
        <ul className="grid gap-px overflow-hidden rounded-m border border-line bg-gray-2">
          {run.conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/firma/gespraeche/${c.id}`}
                className="grid gap-1 bg-surface px-3 py-2 hover:bg-gray-1 sm:grid-cols-[minmax(0,14rem)_auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
              >
                <CustomerLabel
                  firstName={c.firstName}
                  lastName={c.lastName}
                  city={c.city}
                  className="font-medium"
                />
                <StageSquares stage={c.stage} label={tStage(c.stage)} />
                <span className="min-w-0 truncate text-fg-muted">{c.title ?? tStage(c.stage)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-paragraph-xs text-fg-muted">{c.locale.toUpperCase()}</span>
                  <ConversationStatusBadge status={c.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
