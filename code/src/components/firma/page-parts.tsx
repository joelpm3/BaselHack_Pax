import { ChevronRight, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line px-4 pt-6 pb-5 sm:px-6 lg:px-8">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-heading-m font-bold text-contrast-green">{title}</h1>
        {description ? <p className="max-w-2xl text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 py-6 sm:px-6 lg:px-8 [&>*]:min-w-0", className)}>{children}</div>;
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  collapsed,
  meta,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set it to render the panel as a Disclosure (true: closed, false: open). */
  collapsed?: boolean;
  /** Short hint next to a collapsed panel's title, e.g. a count. */
  meta?: ReactNode;
}) {
  if (collapsed !== undefined && title) {
    return (
      <Disclosure title={title} meta={meta} defaultOpen={!collapsed}>
        <div className="grid gap-4">
          {description || actions ? (
            <div className="flex items-start justify-between gap-3">
              {description ? <p className="text-fg-muted">{description}</p> : <span />}
              {actions}
            </div>
          ) : null}
          {children}
        </div>
      </Disclosure>
    );
  }
  return (
    <section className={cn("min-w-0 rounded-xl border border-line p-5", className)}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 className="text-paragraph-m font-bold">{title}</h2>
            {description ? <p className="text-fg-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Links that set one search param, shown as a segmented control. */
export function SegmentedLinks({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: ReactNode; href: string; active: boolean }>;
}) {
  return (
    <nav aria-label={label} className="inline-flex rounded-m border border-line bg-gray-1 p-0.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={cn(
            "rounded-m px-3 py-1.5 font-medium transition-colors",
            item.active ? "bg-surface text-fg ring-1 ring-line" : "text-fg-muted hover:text-fg",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Secondary content behind a click: same frame as a Panel, closed by default. Long analysis data,
 * audit trails and history live here so detail pages lead with what to act on.
 */
export function Disclosure({
  title,
  meta,
  children,
  id,
  defaultOpen = false,
}: {
  title: ReactNode;
  /** Short hint next to the title, e.g. a count. */
  meta?: ReactNode;
  children: ReactNode;
  id?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group min-w-0 scroll-mt-20 rounded-xl border border-line lg:scroll-mt-6"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-4 hover:bg-gray-1 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <span className="font-bold">{title}</span>
        {meta !== undefined ? <span className="ml-auto text-fg-muted">{meta}</span> : null}
      </summary>
      <div className="min-w-0 px-5 pb-5">{children}</div>
    </details>
  );
}

/** "12 of 340 · Show more": lists grow in pages instead of rendering hundreds of rows. */
export function ShowMore({ shown, total, href }: { shown: number; total: number; href: string }) {
  const t = useTranslations("firmaFocus.list");
  if (total <= shown) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={href} scroll={false} className={buttonClasses("secondary", "sm")}>
        {t("showMore")}
      </Link>
      <span className="text-fg-muted">{t("shown", { shown, total })}</span>
    </div>
  );
}

/** A plain GET search form: the query lands in `?q=` and the other filters ride along. */
export function ListSearch({
  label,
  placeholder,
  value,
  keep,
}: {
  label: string;
  placeholder: string;
  value: string;
  /** Other current search params to keep when searching. */
  keep: Record<string, string | null>;
}) {
  return (
    <search className="w-full min-w-0 sm:w-72">
      <form className="relative">
        {Object.entries(keep).map(([name, v]) =>
          v ? <input key={name} type="hidden" name={name} value={v} /> : null,
        )}
        <label className="sr-only" htmlFor="list-search">
          {label}
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
        />
        <Input
          id="list-search"
          type="search"
          name="q"
          defaultValue={value}
          placeholder={placeholder}
          className="h-9 pl-9 text-paragraph-s"
        />
      </form>
    </search>
  );
}

/** An active filter that arrived through a link (e.g. from the overview); click to drop it. */
export function FilterChip({ label, clearHref }: { label: ReactNode; clearHref: string }) {
  const t = useTranslations("firmaFocus.list");
  return (
    <Link
      href={clearHref}
      className="inline-flex max-w-full items-center gap-1.5 rounded-m bg-light-purple px-3 py-1.5 text-deep-purple hover:underline"
    >
      <span className="min-w-0 truncate">{label}</span>
      <X aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">{t("clearFilter")}</span>
    </Link>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="grid min-h-48 place-items-center">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-xl bg-gray-1 px-5 py-8">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-fg-muted">{children}</div> : null}
    </div>
  );
}
