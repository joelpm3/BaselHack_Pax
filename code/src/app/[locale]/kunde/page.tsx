import { and, eq } from "drizzle-orm";
import { ArrowRight, Info } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { Spinner } from "@/components/ui/spinner";
import { db, schema } from "@/lib/db";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { startAsDemoCustomer } from "../chat/actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/kunde">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.demo" });
  return { title: t("title") };
}

/** "Ich bin bereits Pax-Kunde": demo login by picking one of the seeded customers. */
export default function ExistingCustomerPage({ params }: PageProps<"/[locale]/kunde">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("home.demo");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[720px] px-4 pt-10 pb-16 lg:pt-16">
        <h1 className="text-heading-l font-bold text-contrast-green">{t("title")}</h1>
        <p className="mt-3 text-paragraph-l text-fg-muted">{t("lead")}</p>
        <p className="mt-6 flex items-start gap-2 rounded-m bg-light-purple px-4 py-3 text-paragraph-s text-deep-purple">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("note")}
        </p>
        <Suspense
          fallback={
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          }
        >
          <DemoCustomers locale={locale} />
        </Suspense>
      </main>
    </>
  );
}

async function DemoCustomers({ locale }: { locale: string }) {
  await connection();
  const t = await getTranslations("home.demo");
  const tc = await getTranslations("widgets.enums");
  const customers = db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.isDemo, true))
    .all();

  return (
    <ul className="mt-8 flex flex-col gap-3">
      {customers.map((customer) => {
        const profileRow = db.query.profiles
          .findFirst({ where: eq(schema.profiles.customerId, customer.id) })
          .sync();
        const profile = lifeSituationSchema.parse(profileRow?.data ?? {});
        const policies = db
          .select({ id: schema.policies.id })
          .from(schema.policies)
          .where(
            and(eq(schema.policies.customerId, customer.id), eq(schema.policies.isExternal, false)),
          )
          .all().length;
        const facts = [
          profile.person.birthYear ? t("born", { year: profile.person.birthYear }) : null,
          profile.person.maritalStatus ? tc(`maritalStatus.${profile.person.maritalStatus}`) : null,
          profile.children.length ? t("children", { count: profile.children.length }) : null,
          t("policies", { count: policies }),
        ].filter(Boolean);
        const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
        return (
          <li key={customer.id}>
            <form action={startAsDemoCustomer}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="customerId" value={customer.id} />
              <button
                type="submit"
                className="group flex w-full items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4 text-left transition-colors hover:border-pax-purple lg:rounded-xl"
              >
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center bg-pax-purple text-paragraph-s font-bold text-white"
                >
                  {(customer.firstName?.[0] ?? "") + (customer.lastName?.[0] ?? "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-paragraph-m font-bold">{name}</span>
                  <span className="block text-paragraph-s text-fg-muted">{facts.join(", ")}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-5 shrink-0 text-pax-purple transition-transform group-hover:translate-x-0.5"
                />
                <span className="sr-only">{t("choose", { name })}</span>
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
