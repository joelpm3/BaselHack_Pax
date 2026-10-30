import type { ReactNode } from "react";
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
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
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
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-line p-5", className)}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 className="text-base font-bold">{title}</h2>
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
            "rounded-[8px] px-3 py-1.5 font-medium transition-colors",
            item.active ? "bg-surface text-fg ring-1 ring-line" : "text-fg-muted hover:text-fg",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
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
