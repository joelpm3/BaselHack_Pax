import { getTranslations } from "next-intl/server";
import {
  discussHintAction,
  dismissHintAction,
  restoreHintAction,
} from "@/app/[locale]/portal/actions";
import type { HintSeverity, Locale } from "@/lib/domain/taxonomy";
import { ensureFreshHints, type HintRow, listHints } from "@/lib/hints/service";
import { cn } from "@/lib/utils";
import type { PolicyRow } from "./cockpit";
import { EmptyNote } from "./section";
import { SubmitButton } from "./submit-button";

const TONE: Record<HintSeverity, { surface: string; marker: string }> = {
  warning: { surface: "bg-warning-light", marker: "bg-warning" },
  opportunity: { surface: "bg-light-green", marker: "bg-contrast-green" },
  info: { surface: "bg-light-purple", marker: "bg-pax-purple" },
};

/** Where the numbers come from, so a hint is never a black box. */
function sourceKey(hint: HintRow): string | null {
  const data = hint.data ?? {};
  if (hint.type === "cheaper_equivalent") return `source.${String(data.quoteSource)}`;
  if (hint.type === "pension_buyin" && data.source === "logismata") return "source.logismata";
  if (hint.type === "coverage_mismatch" && data.source === "calculation")
    return "source.calculation";
  if (hint.type === "coverage_mismatch" && data.risk === "death") return "source.ruleOfThumb";
  if (hint.type === "coverage_mismatch" && data.risk === "disability") return "source.ivMax";
  return null;
}

function HiddenFields({ hintId, locale }: { hintId: string; locale: string }) {
  return (
    <>
      <input type="hidden" name="hintId" value={hintId} />
      <input type="hidden" name="locale" value={locale} />
    </>
  );
}

async function HintCard({
  hint,
  policy,
  locale,
}: {
  hint: HintRow;
  policy: PolicyRow | undefined;
  locale: string;
}) {
  const t = await getTranslations("portal.hints");
  const tone = TONE[hint.severity];
  const source = sourceKey(hint);
  return (
    <article className={cn("rounded-xl p-5 lg:p-6", tone.surface)}>
      <p className="flex items-center gap-2 text-paragraph-xs font-medium">
        <span className={cn("size-2.5 shrink-0", tone.marker)} aria-hidden />
        {t(`severity.${hint.severity}`)}
      </p>
      <h3 className="mt-2 text-heading-s font-bold">{hint.title}</h3>
      <p className="mt-1.5 text-paragraph-s">{hint.body}</p>
      {policy ? (
        <p className="mt-3 text-paragraph-xs text-fg-muted">
          {t("concerns", { product: policy.productName, insurer: policy.insurer })}
        </p>
      ) : null}
      {source ? <p className="mt-1 text-paragraph-xs text-fg-muted">{t(source)}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={discussHintAction}>
          <HiddenFields hintId={hint.id} locale={locale} />
          <SubmitButton size="sm">{t("discuss")}</SubmitButton>
        </form>
        <form action={dismissHintAction}>
          <HiddenFields hintId={hint.id} locale={locale} />
          <SubmitButton size="sm" variant="ghost">
            {t("dismiss")}
          </SubmitButton>
        </form>
      </div>
    </article>
  );
}

/**
 * Optimisation hints. Streams in its own Suspense boundary: detection and explanations are
 * refreshed here when the profile or a contract changed since the last visit.
 */
export async function HintList({
  customerId,
  locale,
  policies,
}: {
  customerId: string;
  locale: Locale;
  policies: PolicyRow[];
}) {
  const t = await getTranslations("portal.hints");
  const hints = await ensureFreshHints(customerId, locale).catch((error: Error) => {
    console.error("[hints] refresh failed:", error.message);
    return listHints(customerId);
  });
  const open = hints.filter((h) => h.status !== "dismissed");
  const dismissed = hints.filter((h) => h.status === "dismissed");
  const policyById = new Map(policies.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-3">
      {open.length === 0 ? <EmptyNote>{t("empty")}</EmptyNote> : null}
      {open.map((hint) => (
        <HintCard
          key={hint.id}
          hint={hint}
          policy={hint.policyId ? policyById.get(hint.policyId) : undefined}
          locale={locale}
        />
      ))}
      {dismissed.length > 0 ? (
        <details className="group rounded-xl border border-line px-5 py-3">
          <summary className="cursor-pointer text-paragraph-s font-medium">
            {t("dismissedCount", { count: dismissed.length })}
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {dismissed.map((hint) => (
              <li key={hint.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-paragraph-s">{hint.title}</span>
                <form action={restoreHintAction}>
                  <HiddenFields hintId={hint.id} locale={locale} />
                  <SubmitButton size="sm" variant="ghost">
                    {t("restore")}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function HintListSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <p className="text-paragraph-s text-fg-muted">{label}</p>
      {[0, 1].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-muted" />
      ))}
    </div>
  );
}
