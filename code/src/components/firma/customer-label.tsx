import { useTranslations } from "next-intl";
import { displayName } from "@/lib/firma/names";
import { cn } from "@/lib/utils";

/** "Jane Müller" or "Anonym · Basel" for visitors who have not introduced themselves. */
export function CustomerLabel({
  firstName,
  lastName,
  city,
  className,
}: {
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  className?: string;
}) {
  const t = useTranslations("firma.common");
  const name = displayName({ firstName, lastName });
  return (
    <span className={cn("min-w-0 truncate", className)}>
      {name ?? <span className="text-fg-muted">{t("anonymous")}</span>}
      {city ? <span className="text-fg-muted"> · {city}</span> : null}
    </span>
  );
}
