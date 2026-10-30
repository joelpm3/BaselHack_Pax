import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A cockpit section: heading with an optional action on the right. */
export function Section({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={id} className="text-heading-m font-bold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[16px] bg-surface-muted p-5 text-paragraph-s text-fg-muted">{children}</p>
  );
}
