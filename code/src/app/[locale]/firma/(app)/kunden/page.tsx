import { Bot, Search } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { CustomerLabel } from "@/components/firma/customer-label";
import { customerHref } from "@/components/firma/customer-link";
import { KindMark } from "@/components/firma/kind-mark";
import { LiveRefresh } from "@/components/firma/live-events";
import { EmptyState, LoadingBlock, PageBody, PageHeader } from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { parseScope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { listCustomers } from "@/lib/firma/customers";

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
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <CustomersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

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
  const rows = listCustomers(scope, query);
  const [t, tx, tCommon, format] = await Promise.all([
    getTranslations("firmaCustomers.list"),
    getTranslations("firma.taxonomy"),
    getTranslations("firma.common"),
    getFormatter(),
  ]);
  const now = new Date();

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh types={["conversation", "lead", "handover"]} intervalMs={3000} />
      <div className="flex flex-wrap items-end gap-3">
        <search className="w-full min-w-0 sm:w-auto sm:max-w-md sm:flex-1">
          <form className="flex items-center gap-2">
            {scope === "all" ? null : <input type="hidden" name="scope" value={scope} />}
            <label htmlFor="customer-search" className="sr-only">
              {t("search")}
            </label>
            <Input
              id="customer-search"
              type="search"
              name="q"
              defaultValue={query}
              placeholder={t("searchPlaceholder")}
              className="h-9 min-w-0 flex-1 text-sm"
            />
            <button type="submit" className={buttonClasses("secondary", "sm")}>
              <Search aria-hidden />
              {t("search")}
            </button>
          </form>
        </search>
        <ScopeSwitch path="/firma/kunden" scope={scope} extra={{ q: query || null }} />
      </div>

      <p className="text-fg-muted">{t("count", { count: rows.length })}</p>

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
                className="grid grid-cols-2 items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-gray-1 md:grid-cols-[minmax(0,1fr)_7rem_10.5rem_10rem_8rem]"
              >
                <span className="col-span-2 grid min-w-0 gap-0.5 md:col-span-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <CustomerLabel
                      firstName={c.firstName}
                      lastName={c.lastName}
                      city={c.city}
                      className="font-medium"
                    />
                    {c.isSimulated ? (
                      <Bot
                        aria-label={tCommon("simulated")}
                        className="size-3.5 shrink-0 text-fg-muted"
                      />
                    ) : null}
                  </span>
                  {c.email || c.phone ? (
                    <span className="truncate text-xs text-fg-muted">
                      {[c.phone, c.email].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                </span>
                <span>
                  <Badge tone={c.lifecycle === "client" ? "success" : "neutral"}>
                    {tx(`lifecycle.${c.lifecycle}`)}
                  </Badge>
                </span>
                <span
                  className={
                    c.openHandovers > 0
                      ? "flex items-center gap-2 font-medium"
                      : "flex items-center gap-2 text-fg-muted"
                  }
                >
                  <KindMark kind="handover" className={c.openHandovers > 0 ? "" : "opacity-40"} />
                  {t("openHandovers", { count: c.openHandovers })}
                </span>
                <span
                  className={
                    c.openLeads > 0
                      ? "flex items-center gap-2 font-medium"
                      : "flex items-center gap-2 text-fg-muted"
                  }
                >
                  <KindMark kind="lead" className={c.openLeads > 0 ? "" : "opacity-40"} />
                  {c.openLeads > 0 && c.topLeadScore !== null
                    ? t("openLeadsScore", { count: c.openLeads, score: c.topLeadScore })
                    : t("openLeads", { count: c.openLeads })}
                </span>
                <span className="text-xs text-fg-muted md:text-right">
                  {t("conversations", { count: c.conversationCount })}
                  {c.lastContactAt ? (
                    <>
                      <br />
                      {format.relativeTime(c.lastContactAt, now)}
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
