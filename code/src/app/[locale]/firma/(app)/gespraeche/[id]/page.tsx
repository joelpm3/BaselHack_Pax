import { ArrowLeft, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ConversationStatusBadge, SimulatedBadge } from "@/components/firma/badges";
import { RerunAnalysisButton } from "@/components/firma/controls";
import { AnalysisSection } from "@/components/firma/conversation/analysis-section";
import { HandoversSection, LeadsSection } from "@/components/firma/conversation/leads-section";
import { ProfileSection } from "@/components/firma/conversation/profile-section";
import {
  AuditSection,
  CalculationsSection,
  DocumentsSection,
  RecommendationsSection,
} from "@/components/firma/conversation/records-section";
import { Transcript } from "@/components/firma/conversation/transcript";
import { customerHref } from "@/components/firma/customer-link";
import { LiveRefresh, LiveStatus } from "@/components/firma/live-events";
import { LoadingBlock, PageBody, Panel } from "@/components/firma/page-parts";
import { StageSquares } from "@/components/firma/stage-squares";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireAdvisor } from "@/lib/firma/auth";
import { getConversationDetail } from "@/lib/firma/conversations";
import { displayName } from "@/lib/firma/names";
import { isAnalysisPending } from "@/lib/insights";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/gespraeche/[id]">): Promise<Metadata> {
  const t = await getTranslations({
    locale: (await params).locale,
    namespace: "firma.conversation",
  });
  return { title: t("title") };
}

/**
 * The conversation id is runtime data (not known at build time), so the whole screen streams
 * behind one boundary and the locale is set there.
 */
export default function ConversationPage({ params }: PageProps<"/[locale]/firma/gespraeche/[id]">) {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ConversationContent params={params} />
    </Suspense>
  );
}

async function ConversationContent({
  params,
}: {
  params: PageProps<"/[locale]/firma/gespraeche/[id]">["params"];
}) {
  const { locale: routeLocale, id } = await params;
  setRequestLocale(routeLocale);
  await requireAdvisor();
  await connection();
  const detail = getConversationDetail(id);
  if (!detail) notFound();
  const [t, tCustomer, tStage, tMode, tCommon, format, locale] = await Promise.all([
    getTranslations("firma.conversation"),
    getTranslations("firmaCustomers.detail"),
    getTranslations("common.taxonomy.stages"),
    getTranslations("firma.taxonomy.mode"),
    getTranslations("firma.common"),
    getFormatter(),
    getLocale(),
  ]);
  const { conversation, customer } = detail;
  const name = displayName(customer) ?? detail.profile.person.firstName ?? tCommon("anonymous");

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/firma/gespraeche"
          className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <LiveStatus />
      </div>
      <LiveRefresh
        types={["conversation", "analysis", "lead", "handover", "document"]}
        conversationId={conversation.id}
        intervalMs={1500}
      />
      <header className="grid gap-3 border-b border-line px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-bold leading-tight">
              <Link href={customerHref(customer.id)} className="hover:underline">
                {name}
              </Link>
            </h1>
            <p className="text-fg-muted">{conversation.title ?? t("untitled")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={customerHref(customer.id)} className={buttonClasses("secondary", "sm")}>
              <UserRound aria-hidden />
              {tCustomer("open")}
            </Link>
            <RerunAnalysisButton conversationId={conversation.id} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <StageSquares stage={conversation.stage} label={tStage(conversation.stage)} />
            <span className="font-medium">{tStage(conversation.stage)}</span>
          </span>
          <ConversationStatusBadge status={conversation.status} />
          {conversation.isSimulated ? <SimulatedBadge /> : null}
          <span className="text-fg-muted">
            {tMode(conversation.mode)} · {conversation.locale.toUpperCase()} ·{" "}
            {t("started", {
              time: format.dateTime(conversation.createdAt, {
                day: "numeric",
                month: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
            {detail.ruleSetVersion !== null
              ? ` · ${t("ruleSet", { version: detail.ruleSetVersion })}`
              : ""}
          </span>
        </div>
      </header>

      <PageBody className="grid gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
          <Panel
            title={t("transcript.title")}
            description={t("transcript.description", { count: detail.messages.length })}
          >
            <Transcript messages={detail.messages} />
          </Panel>
          <div className="grid content-start gap-6">
            <AnalysisSection
              analysis={detail.analysis}
              rules={detail.rules}
              pending={isAnalysisPending(conversation.id)}
              locale={locale}
            />
            <LeadsSection detail={detail} locale={locale} />
            <HandoversSection detail={detail} />
            <ProfileSection detail={detail} locale={locale} asOf={conversation.createdAt} />
          </div>
        </div>
        <RecommendationsSection detail={detail} locale={locale} />
        <div className="grid gap-6 xl:grid-cols-2">
          <CalculationsSection detail={detail} />
          <DocumentsSection detail={detail} />
        </div>
        <AuditSection detail={detail} />
      </PageBody>
    </>
  );
}
