import { Handshake, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The two kinds of work on the dashboard, always drawn the same way so advisors can tell them
 * apart at a glance: a handover (the person wants or needs a human) and a lead (a sales chance).
 */
export type WorkKind = "handover" | "lead";

const STYLE: Record<WorkKind, { icon: typeof Handshake; tile: string }> = {
  handover: { icon: Handshake, tile: "bg-warning-light text-warning-dark" },
  lead: { icon: Target, tile: "bg-light-purple text-deep-purple" },
};

/** Square icon tile (the Pax square as visual unit), optionally with the kind's name. */
export function KindMark({
  kind,
  withLabel = false,
  className,
}: {
  kind: WorkKind;
  withLabel?: boolean;
  className?: string;
}) {
  const t = useTranslations("firmaCustomers.kinds");
  const { icon: Icon, tile } = STYLE[kind];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden={withLabel} className={cn("grid size-7 shrink-0 place-items-center", tile)}>
        <Icon
          aria-label={withLabel ? undefined : t(`${kind}.name`)}
          className="size-4"
          strokeWidth={1.75}
        />
      </span>
      {withLabel ? <span className="font-medium">{t(`${kind}.name`)}</span> : null}
    </span>
  );
}

/**
 * One-line definition shown wherever leads and handovers could be confused. Rendered as a block
 * `span` so it also fits inside a paragraph (e.g. a page header description).
 */
export function KindDefinition({ kind, className }: { kind: WorkKind; className?: string }) {
  const t = useTranslations("firmaCustomers.kinds");
  return <span className={cn("block text-fg-muted", className)}>{t(`${kind}.definition`)}</span>;
}
