"use client";

import { Check, ExternalLink, FileText, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import {
  confirmExtractionAction,
  discardDocumentAction,
  retryExtractionAction,
} from "@/lib/documents/actions";
import { LOW_CONFIDENCE } from "@/lib/documents/constants";
import {
  DOCUMENT_FIELDS,
  type ExtractableDocumentType,
  FIELD_GROUPS,
  isExtractable,
} from "@/lib/documents/fields";
import type { DocumentSubject, ExtractionSummary } from "@/lib/documents/types";
import type { Locale } from "@/lib/domain/taxonomy";
import { cn } from "@/lib/utils";
import { type EditValue, FieldRow } from "./field-row";

export type ReviewOutcome = "confirmed" | "discarded";

export function needsReview(summary: ExtractionSummary): boolean {
  return (
    summary.status === "extracted" &&
    isExtractable(summary.docType) &&
    summary.fields.length > 0 &&
    !summary.confirmedAt
  );
}

export function inProgress(summary: ExtractionSummary): boolean {
  return summary.status === "uploaded" || summary.status === "extracting";
}

interface DocumentReviewProps {
  summary: ExtractionSummary;
  /** Inside a list that already names the document: no per-document header. */
  embedded?: boolean;
  busy: boolean;
  onResolved: (summary: ExtractionSummary, outcome: ReviewOutcome) => void;
  onUpdated: (summary: ExtractionSummary) => void;
}

function SubjectChoice({
  summary,
  value,
  onChange,
}: {
  summary: ExtractionSummary;
  value: DocumentSubject;
  onChange: (subject: DocumentSubject) => void;
}) {
  const t = useTranslations("documents.review");
  const options: Array<[DocumentSubject, string]> = [
    [
      "self",
      summary.names?.self ? t("subjectSelfNamed", { name: summary.names.self }) : t("subjectSelf"),
    ],
    [
      "partner",
      summary.names?.partner
        ? t("subjectPartner", { name: summary.names.partner })
        : t("subjectPartnerUnnamed"),
    ],
  ];
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-paragraph-s font-medium">{t("subjectQuestion")}</legend>
      <div className="inline-flex rounded-full bg-gray-1 p-1">
        {options.map(([subject, label]) => (
          <label
            key={subject}
            className={cn(
              "cursor-pointer rounded-full px-4 py-1.5 text-paragraph-xs font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-pax-green",
              value === subject ? "bg-pax-purple text-white" : "text-ink hover:bg-gray-2",
            )}
          >
            <input
              type="radio"
              name={`subject-${summary.documentId}`}
              value={subject}
              checked={value === subject}
              onChange={() => onChange(subject)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DocumentHeader({ summary }: { summary: ExtractionSummary }) {
  const t = useTranslations("documents");
  const tc = useTranslations("common.taxonomy.docType");
  return (
    <header className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center bg-light-purple text-pax-purple">
        <FileText className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{summary.docType ? tc(summary.docType) : summary.filename}</p>
        <p className="truncate text-paragraph-xs text-fg-muted">{summary.filename}</p>
      </div>
      {summary.status !== "deleted" ? (
        <a
          href={`/api/documents/${summary.documentId}/file`}
          target="_blank"
          rel="noopener"
          className="inline-flex shrink-0 items-center gap-1 text-paragraph-xs font-medium text-contrast-green underline-offset-2 hover:underline"
        >
          {t("review.viewDocument")}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </header>
  );
}

/** Review of one document inside the "Das habe ich gelesen" card. */
export function DocumentReview({
  summary,
  embedded,
  busy,
  onResolved,
  onUpdated,
}: DocumentReviewProps) {
  const t = useTranslations("documents");
  const tc = useTranslations("common.taxonomy.docType");
  const locale = useLocale() as Locale;
  const [edits, setEdits] = useState<Record<string, EditValue>>({});
  // The extraction may finish after mount: follow its subject until the customer picks one.
  const [chosenSubject, setSubject] = useState<DocumentSubject | null>(null);
  const subject = chosenSubject ?? summary.subject ?? "self";
  const [askDiscard, setAskDiscard] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = busy || pending;

  if (inProgress(summary))
    return (
      <div className="flex items-center gap-3 py-2">
        <Spinner />
        <p className="text-paragraph-s text-fg-muted">
          {t("review.reading", { filename: summary.filename })}
        </p>
      </div>
    );

  if (summary.status === "deleted")
    return (
      <div>
        {embedded ? null : <DocumentHeader summary={summary} />}
        <p className="mt-3 text-paragraph-s text-fg-muted">{t("review.discarded")}</p>
      </div>
    );

  if (summary.status === "confirmed" || summary.confirmedAt) {
    const count = summary.fields.length;
    return (
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center bg-light-green text-deep-green">
          <Check className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t("review.confirmed")}</p>
          <p className="text-paragraph-s text-fg-muted">
            {t("review.confirmedDetail", {
              count,
              docType: summary.docType ? tc(summary.docType) : summary.filename,
            })}
          </p>
          <Link
            href="/portal"
            className="mt-1 inline-block text-paragraph-xs font-medium text-contrast-green underline-offset-2 hover:underline"
          >
            {t("review.toCockpit")}
          </Link>
        </div>
      </div>
    );
  }

  function discard() {
    startTransition(async () => {
      const result = await discardDocumentAction(summary.documentId);
      if (!result.ok) return setError(true);
      onResolved({ ...summary, status: "deleted" }, "discarded");
    });
  }

  function retry() {
    setError(false);
    onUpdated({ ...summary, status: "extracting" });
    startTransition(async () => {
      const next = await retryExtractionAction(summary.documentId);
      if (next) onUpdated(next);
      else setError(true);
    });
  }

  function confirm() {
    setError(false);
    startTransition(async () => {
      const result = await confirmExtractionAction({
        documentId: summary.documentId,
        edits,
        subject,
        locale,
      });
      if (!result.ok) return setError(true);
      const fields = summary.fields
        .filter((f) => edits[f.path] !== null)
        .map((f) => (f.path in edits ? { ...f, value: edits[f.path], confidence: 1 } : f));
      onResolved(
        { ...summary, fields, status: "confirmed", confirmedAt: new Date().toISOString(), subject },
        "confirmed",
      );
    });
  }

  const discardControls = askDiscard ? (
    <div className="flex flex-wrap items-center gap-2">
      <p className="w-full text-paragraph-s">{t("review.discardQuestion")}</p>
      <Button size="sm" variant="danger" onClick={discard} disabled={disabled}>
        {t("review.discardConfirm")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAskDiscard(false)} disabled={disabled}>
        {t("review.keep")}
      </Button>
    </div>
  ) : null;

  if (
    summary.status === "failed" ||
    !isExtractable(summary.docType) ||
    summary.fields.length === 0
  ) {
    const message =
      summary.status === "failed"
        ? t("review.failed")
        : summary.docType === "other"
          ? t("review.other")
          : t("review.nothingFound");
    return (
      <div>
        {embedded ? null : <DocumentHeader summary={summary} />}
        <p className="mt-3 text-paragraph-s text-fg-muted">{message}</p>
        {summary.status === "failed" || summary.docType !== "other" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {askDiscard ? (
              discardControls
            ) : (
              <>
                {summary.status === "failed" ? (
                  <Button size="sm" variant="secondary" onClick={retry} disabled={disabled}>
                    <RotateCcw aria-hidden />
                    {t("review.retry")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAskDiscard(true)}
                  disabled={disabled}
                >
                  {t("review.remove")}
                </Button>
              </>
            )}
          </div>
        ) : null}
        {error ? (
          <p className="mt-2 text-paragraph-xs text-error-dark">{t("review.error")}</p>
        ) : null}
      </div>
    );
  }

  const docType: ExtractableDocumentType = summary.docType;
  const byPath = new Map(summary.fields.map((f) => [f.path, f]));
  const toCheck = summary.fields.filter(
    (f) => f.confidence < LOW_CONFIDENCE && !(f.path in edits),
  ).length;
  const showSubject = docType !== "insurance_policy" && Boolean(summary.names?.partner);

  return (
    <div>
      {embedded ? null : <DocumentHeader summary={summary} />}
      {toCheck > 0 ? (
        <p className="mt-3 text-paragraph-xs font-medium text-warning-dark">
          {t("review.checkCount", { count: toCheck })}
        </p>
      ) : null}

      {FIELD_GROUPS[docType].map((group) => {
        const defs = DOCUMENT_FIELDS[docType].filter((d) => d.group === group && byPath.has(d.key));
        if (defs.length === 0) return null;
        return (
          <section key={group} className="mt-4">
            <h4 className="text-paragraph-xs font-medium text-fg-muted">{t(`groups.${group}`)}</h4>
            <dl className="divide-y divide-line">
              {defs.map((def) => {
                const field = byPath.get(def.key);
                if (!field) return null;
                return (
                  <FieldRow
                    key={def.key}
                    docType={docType}
                    def={def}
                    field={field}
                    edit={def.key in edits ? edits[def.key] : undefined}
                    readOnly={disabled}
                    onEdit={(value) =>
                      setEdits((prev) => {
                        const next = { ...prev };
                        if (value === undefined) delete next[def.key];
                        else next[def.key] = value;
                        return next;
                      })
                    }
                  />
                );
              })}
            </dl>
          </section>
        );
      })}

      {showSubject ? (
        <SubjectChoice summary={summary} value={subject} onChange={setSubject} />
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {askDiscard ? (
          discardControls
        ) : (
          <>
            <Button onClick={confirm} disabled={disabled} className="max-sm:flex-1">
              {pending ? <Spinner className="[&>span]:bg-white" /> : <Check aria-hidden />}
              {t("review.confirm")}
            </Button>
            <Button variant="ghost" onClick={() => setAskDiscard(true)} disabled={disabled}>
              {t("review.discard")}
            </Button>
          </>
        )}
      </div>
      {error ? <p className="mt-2 text-paragraph-xs text-error-dark">{t("review.error")}</p> : null}
    </div>
  );
}
