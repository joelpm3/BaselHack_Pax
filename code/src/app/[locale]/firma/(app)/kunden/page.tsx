// One job: find a person and open their customer page. Whoever has open work (a handover, then a
// lead) comes first; contact details and history live on the customer page.
import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { CustomerLabel } from "@/components/firma/customer-label";
import { customerHref } from "@/components/firma/customer-link";
import { KindMark } from "@/components/firma/kind-mark";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  ListSearch,
  LoadingBlock,
  PageBody,
  PageHeader,
  ShowMore,
} from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { hrefWith } from "@/components/firma/url";
import { Link } from "@/i18n/navigation";
import { PAGE_SIZE, parseLimit, parseScope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { listCustomers } from "@/lib/firma/customers";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/kunden">): Promise<Metadata> {
  const t = await getTranslations({
    locale: (await params).locale,
    namespace: "firmaCustomers.list",
  });
  return { title: t("title") };
}

export default function CustomersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/firma/kunden">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firmaCustomers.list");
  return (
    <>
      <PageHeader title={t("title")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <CustomersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const PATH = "/firma/kunden";

async function CustomersContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const query = typeof params.q === "string" ? params.q : "";
  const limit = parseLimit(params.limit);
  const { rows, total } = listCustomers(scope, query, limit);
  const [t, tFocus, format] = await Promise.all([
    getTranslations("firmaCustomers.list"),
    getTranslations("firmaFocus.list"),
    getFormatter(),
  ]);
  const now = new Date();
  const current = { scope: scope === "all" ? null : scope, q: query || null };

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh types={["conversation", "lead", "handover"]} intervalMs={3000} />
      <div className="flex flex-wrap items-end gap-3">
        <ListSearch
          label={t("search")}
          placeholder={t("searchPlaceholder")}
          value={query}
          keep={{ scope: current.scope }}
        />
        <ScopeSwitch path={PATH} scope={scope} extra={{ q: current.q }} />
      </div>

      <p className="text-fg-muted">{t("count", { count: total })}</p>

      {rows.length === 0 ? (
        <EmptyState title={query ? t("emptySearch", { query }) : t("emptyTitle")}>
          {t("emptyBody")}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-gray-2 rounded-xl border border-line">
          {rows.map((c) => (
            <li key={c.customerId}>
              <Link
                href={customerHref(c.customerId)}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-gray-1 sm:grid-cols-[minmax(0,1fr)_auto_8rem]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CustomerLabel
                    firstName={c.firstName}
                    lastName={c.lastName}
                    city={c.city}
                    className="font-medium"
                  />
                  {c.isSimulated ? (
                    <Bot
                      aria-label={tFocus("simulated")}
                      className="size-3.5 shrink-0 text-fg-muted"
                    />
                  ) : null}
                </span>
                <span className="flex items-center gap-3">
                  <OpenWork kind="handover" count={c.openHandovers} />
                  <OpenWork kind="lead" count={c.openLeads} score={c.topLeadScore} />
                </span>
                <span className="col-span-2 text-paragraph-xs text-fg-muted sm:col-span-1 sm:text-right">
                  {c.lastContactAt ? format.relativeTime(c.lastContactAt, now) : "–"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ShowMore
        shown={rows.length}
        total={total}
        href={hrefWith(PATH, { ...current, limit: limit + PAGE_SIZE })}
      />
    </PageBody>
  );
}

/** A kind tile with its count; faded when nothing is open, so open work stands out in the list. */
function OpenWork({
  kind,
  count,
  score,
}: {
  kind: "handover" | "lead";
  count: number;
  score?: number | null;
}) {
  const t = useTranslations("firmaCustomers.list");
  const label =
    kind === "handover"
      ? t("openHandovers", { count })
      : count > 0 && score != null
        ? t("openLeadsScore", { count, score })
        : t("openLeads", { count });
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 tabular-nums",
        count > 0 ? "font-medium" : "text-fg-subtle",
      )}
    >
      <span aria-hidden className="contents">
        <KindMark kind={kind} className={count > 0 ? "" : "opacity-30"} />
        {count}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
