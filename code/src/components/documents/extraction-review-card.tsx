"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useChatActions } from "@/components/chat/chat-actions";
import type { ExtractionSummary } from "@/lib/documents/types";
import { DocumentReview, inProgress, needsReview, type ReviewOutcome } from "./document-review";

/**
 * CONTRACT (owned by the documents area): the "Das habe ich gelesen" card rendered for the
 * advisor's `reviewDocuments` tool result. Lets the customer correct and confirm the values,
 * then uses useChatActions().sendMessage to tell the advisor.
 */
export interface ExtractionReviewCardProps {
  extractions: ExtractionSummary[];
  /** Inside the cockpit's document list: no card heading and no per-document header. */
  embedded?: boolean;
}

const POLL_MS = 2500;
const TERMINAL = new Set(["confirmed", "deleted"]);

async function fetchSummary(documentId: string): Promise<ExtractionSummary | null> {
  try {
    const res = await fetch(`/api/documents/${documentId}`, { cache: "no-store" });
    if (res.status === 404) return null;
    return res.ok ? ((await res.json()) as ExtractionSummary) : null;
  } catch {
    return null;
  }
}

/** Keeps the card truthful: a reloaded chat shows today's state, running extractions are polled. */
function useLiveSummaries(initial: ExtractionSummary[]) {
  const [summaries, setSummaries] = useState(initial);
  const idsKey = initial.map((e) => e.documentId).join(",");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ids = idsKey.split(",").filter(Boolean);
    async function refresh() {
      const fetched = await Promise.all(ids.map(fetchSummary));
      if (cancelled) return;
      // Follow the current id list, so documents added after mount (a second upload) show up.
      setSummaries((prev) =>
        ids.flatMap((id, i) => {
          const current = prev.find((s) => s.documentId === id);
          const next = fetched[i];
          if (!current) return next ? [next] : [];
          // Never let a slow response undo what the customer just did.
          if (!next || (TERMINAL.has(current.status) && !TERMINAL.has(next.status)))
            return [current];
          return [next];
        }),
      );
      if (fetched.some((f) => f && inProgress(f))) timer = setTimeout(refresh, POLL_MS);
    }
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [idsKey]);

  return [summaries, setSummaries] as const;
}

export function ExtractionReviewCard({ extractions, embedded }: ExtractionReviewCardProps) {
  const t = useTranslations("documents.review");
  const tc = useTranslations("common.taxonomy.docType");
  const locale = useLocale();
  const { sendMessage, busy } = useChatActions();
  const [summaries, setSummaries] = useLiveSummaries(extractions);
  const [outcomes, setOutcomes] = useState<Record<string, ReviewOutcome>>({});

  const replace = (next: ExtractionSummary) =>
    setSummaries((prev) => prev.map((s) => (s.documentId === next.documentId ? next : s)));

  function tellAdvisor(resolved: Record<string, ReviewOutcome>, all: ExtractionSummary[]) {
    const list = new Intl.ListFormat(locale, { type: "conjunction" });
    const label = (s: ExtractionSummary) => (s.docType ? tc(s.docType) : s.filename);
    const confirmed = all.filter((s) => resolved[s.documentId] === "confirmed");
    const discarded = all.filter((s) => resolved[s.documentId] === "discarded");
    const parts = [
      confirmed.length > 0
        ? t("messageConfirmed", { documents: list.format(confirmed.map(label)) })
        : "",
      discarded.length > 0
        ? t("messageDiscarded", { documents: list.format(discarded.map(label)) })
        : "",
    ].filter(Boolean);
    if (parts.length === 0) return;
    sendMessage(parts.join(" "), {
      inputMode: "widget",
      documentIds: [...confirmed, ...discarded].map((s) => s.documentId),
    });
  }

  function handleResolved(next: ExtractionSummary, outcome: ReviewOutcome) {
    const resolved = { ...outcomes, [next.documentId]: outcome };
    const all = summaries.map((s) => (s.documentId === next.documentId ? next : s));
    setOutcomes(resolved);
    setSummaries(all);
    // One message once nothing in this card waits for the customer any more.
    if (!all.some((s) => needsReview(s) || inProgress(s))) tellAdvisor(resolved, all);
  }

  return (
    <section
      aria-label={t("title")}
      className="w-full rounded-[16px] border border-line bg-surface p-5 lg:rounded-xl lg:p-6"
    >
      {embedded ? null : (
        <header className="mb-5">
          <h3 className="flex items-center gap-2.5 text-heading-s font-bold">
            <span className="size-2.5 shrink-0 bg-pax-green" aria-hidden />
            {t("title")}
          </h3>
          <p className="mt-1 text-paragraph-s text-fg-muted">{t("intro")}</p>
        </header>
      )}
      <div className="divide-y divide-line [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {summaries.map((summary) => (
          <DocumentReview
            key={summary.documentId}
            summary={summary}
            embedded={embedded}
            busy={busy}
            onResolved={handleResolved}
            onUpdated={replace}
          />
        ))}
      </div>
    </section>
  );
}
