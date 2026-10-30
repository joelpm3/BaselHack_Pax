"use client";

import type { LucideIcon } from "lucide-react";
import { CircleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn, formatChf } from "@/lib/utils";

/** The quiet frame every generative-UI widget sits in. */
export function WidgetCard({
  icon: Icon,
  title,
  aside,
  children,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border border-line bg-surface p-4 sm:p-5 lg:rounded-xl",
        className,
      )}
    >
      <header className="flex items-center gap-2.5">
        <Icon aria-hidden className="size-5 shrink-0 text-pax-purple" strokeWidth={2} />
        <h3 className="flex-1 text-paragraph-s font-bold">{title}</h3>
        {aside}
      </header>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

/** Shown while the tool runs (input streaming or executing). */
export function WidgetPending({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <WidgetCard icon={icon} title={label} aside={<Spinner label={label} />} className="py-3.5" />
  );
}

/** Shown when the tool failed (e.g. calculation service down). */
export function WidgetFailed({ icon, title }: { icon: LucideIcon; title: string }) {
  const t = useTranslations("widgets.common");
  return (
    <WidgetCard icon={icon} title={title}>
      <p className="flex items-start gap-2 text-paragraph-s text-fg-muted">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-dark" />
        {t("failed")}
      </p>
    </WidgetCard>
  );
}

/** Small print under calculations (assumptions, non-binding). */
export function FinePrint({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-paragraph-xs text-fg-muted">{children}</p>;
}

export function useChf() {
  const locale = useLocale();
  return (amount: number) => formatChf(Math.round(amount), locale);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
