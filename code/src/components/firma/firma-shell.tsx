"use client";

import {
  Bot,
  CalendarClock,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Radio,
  ScrollText,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, Suspense, useState } from "react";
import { logout } from "@/app/[locale]/firma/actions";
import { PaxLogo } from "@/components/ui/logo";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALES } from "@/lib/domain/taxonomy";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/firma", key: "overview", icon: LayoutDashboard },
  { href: "/firma/live", key: "live", icon: Radio },
  { href: "/firma/gespraeche", key: "conversations", icon: MessagesSquare },
  { href: "/firma/kunden", key: "customers", icon: UsersRound },
  { href: "/firma/leads", key: "leads", icon: Target },
  { href: "/firma/uebergaben", key: "handovers", icon: Handshake },
  { href: "/firma/wiedervorlagen", key: "followUps", icon: CalendarClock },
  { href: "/firma/regeln", key: "rules", icon: ScrollText },
  { href: "/firma/simulation", key: "simulation", icon: Bot },
] as const;

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === "/firma"
    ? pathname === "/firma"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Labels for entries added after the original nav, and the short "what is this" hints. */
const EXTRA_LABEL: Partial<Record<(typeof NAV)[number]["key"], "customers">> = {
  customers: "customers",
};
const HINT: Partial<Record<(typeof NAV)[number]["key"], "leadsHint" | "handoversHint">> = {
  leads: "leadsHint",
  handovers: "handoversHint",
};

function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  const t = useTranslations("firma.nav");
  const tExtra = useTranslations("firmaCustomers.nav");
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ href, key, icon: Icon }) => {
        const active = isActive(pathname, href);
        const extra = EXTRA_LABEL[key];
        const hint = HINT[key];
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-m px-3 py-1 text-[15px] transition-colors",
                active
                  ? "bg-white/12 text-white"
                  : "text-white/75 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
              <span className="grid flex-1 leading-tight">
                {extra ? tExtra(extra) : t(key as Exclude<typeof key, "customers">)}
                {hint ? <span className="text-xs text-white/60">{tExtra(hint)}</span> : null}
              </span>
              {active ? <span aria-hidden className="size-2 bg-pax-green" /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The pathname is runtime data on dynamic routes, so it is read behind a Suspense boundary. */
function CurrentNavList({ onNavigate }: { onNavigate: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}

function LocaleLinks({ pathname }: { pathname: string }) {
  const t = useTranslations("firma.nav");
  const locale = useLocale();
  return (
    <ul className="flex gap-1" aria-label={t("language")}>
      {LOCALES.map((l) => (
        <li key={l}>
          <Link
            href={pathname}
            locale={l}
            aria-current={l === locale ? "true" : undefined}
            className={cn(
              "grid h-7 min-w-9 place-items-center rounded-sm px-1.5 text-xs font-medium",
              l === locale
                ? "bg-white text-deep-purple"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            {l.toUpperCase()}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CurrentLocaleLinks() {
  return <LocaleLinks pathname={usePathname()} />;
}

/** Deep Purple navigation (Pax brand) with a white work area; a drawer below `lg`. */
export function FirmaShell({
  advisorSlot,
  children,
}: {
  advisorSlot: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("firma.nav");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    // The dashboard is denser than the customer app: smaller paragraph steps for shared UI parts.
    <div className="min-h-dvh text-sm [--text-paragraph-s:0.875rem] [--text-paragraph-xs:0.75rem] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-deep-purple px-4 text-white lg:hidden">
        <Link href="/firma" className="flex items-center gap-3">
          <PaxLogo variant="negative" className="h-6" />
          <span className="font-medium">{t("cockpit")}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-mr-2 grid size-10 place-items-center rounded-m hover:bg-white/10"
          aria-label={t("menu")}
          aria-expanded={open}
          aria-controls="firma-nav"
        >
          <Menu aria-hidden className="size-5" />
        </button>
      </header>

      {open ? (
        <button
          type="button"
          aria-label={t("close")}
          onClick={close}
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
        />
      ) : null}

      <aside
        id="firma-nav"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-deep-purple text-white transition-transform motion-reduce:transition-none",
          "lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/firma" className="flex items-center gap-3" onClick={close}>
            <PaxLogo variant="negative" className="h-6" />
            <span className="font-medium text-white/90">{t("cockpit")}</span>
          </Link>
          <button
            type="button"
            onClick={close}
            className="-mr-2 grid size-9 place-items-center rounded-m hover:bg-white/10 lg:hidden"
            aria-label={t("close")}
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <nav aria-label={t("label")} className="flex-1 overflow-y-auto px-3 py-2">
          <Suspense fallback={<NavList pathname={null} onNavigate={close} />}>
            <CurrentNavList onNavigate={close} />
          </Suspense>
        </nav>

        <div className="grid gap-3 border-t border-white/15 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            {advisorSlot}
            <form action={logout}>
              <button
                type="submit"
                title={t("logout")}
                className="-mr-2 grid size-9 place-items-center rounded-m text-white/75 hover:bg-white/10 hover:text-white"
              >
                <LogOut aria-hidden className="size-4" />
                <span className="sr-only">{t("logout")}</span>
              </button>
            </form>
          </div>
          <Suspense fallback={<LocaleLinks pathname="/firma" />}>
            <CurrentLocaleLinks />
          </Suspense>
        </div>
      </aside>

      <main className="min-w-0 bg-surface">{children}</main>
    </div>
  );
}
