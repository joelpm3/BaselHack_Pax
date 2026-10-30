import { useTranslations } from "next-intl";
import { SCOPES, type Scope } from "@/lib/firma/aggregate";
import { SegmentedLinks } from "./page-parts";
import { hrefWith } from "./url";

/** Real / simulated / all: every dashboard list and chart can be filtered by origin. */
export function ScopeSwitch({
  path,
  scope,
  extra = {},
}: {
  path: string;
  scope: Scope;
  extra?: Record<string, string | number | null>;
}) {
  const t = useTranslations("firma.scope");
  return (
    <SegmentedLinks
      label={t("label")}
      items={SCOPES.map((s) => ({
        key: s,
        label: t(s),
        href: hrefWith(path, { ...extra, scope: s === "all" ? null : s }),
        active: s === scope,
      }))}
    />
  );
}
