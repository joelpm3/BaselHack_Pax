"use client";

import { ExternalLink, FileText, Lock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deletePortalDocumentAction } from "@/app/[locale]/portal/actions";
import { DocumentUploadButton } from "@/components/documents/document-upload-button";
import { ExtractionReviewCard } from "@/components/documents/extraction-review-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSwissDate } from "@/lib/documents/dates";
import type { ExtractionSummary } from "@/lib/documents/types";
import type { DocumentStatus, DocumentType } from "@/lib/domain/taxonomy";
import { PortalChatBridge } from "./portal-chat-bridge";

export interface PortalDocument {
  id: string;
  filename: string;
  docType: DocumentType | null;
  status: DocumentStatus;
  /** ISO date. */
  uploadedAt: string;
  pageCount: number | null;
  /** Present while the customer still has to review the values (or extraction failed). */
  review: ExtractionSummary | null;
}

const STATUS_TONE: Record<DocumentStatus, "neutral" | "warning" | "success" | "error" | "info"> = {
  uploaded: "neutral",
  extracting: "info",
  extracted: "warning",
  confirmed: "success",
  failed: "error",
  deleted: "neutral",
};

function DocumentRow({ doc, initiallyOpen }: { doc: PortalDocument; initiallyOpen: boolean }) {
  const t = useTranslations("portal.documents");
  const tStatus = useTranslations("documents.status");
  const tType = useTranslations("common.taxonomy.docType");
  const [askDelete, setAskDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reviewOpen, setReviewOpen] = useState(initiallyOpen);
  const label = doc.docType ? tType(doc.docType) : doc.filename;
  const statusLabel =
    doc.status === "extracted" && doc.docType === "other" ? t("filed") : tStatus(doc.status);

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center bg-light-purple text-pax-purple">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          <p className="truncate text-paragraph-xs text-fg-muted">
            {t("meta", { filename: doc.filename, date: formatSwissDate(doc.uploadedAt) })}
          </p>
        </div>
        <Badge tone={STATUS_TONE[doc.status]} className="max-sm:hidden">
          {statusLabel}
        </Badge>
        <a
          href={`/api/documents/${doc.id}/file`}
          target="_blank"
          rel="noopener"
          aria-label={t("viewNamed", { filename: doc.filename })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-gray-1 hover:text-ink"
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
        <button
          type="button"
          onClick={() => setAskDelete(true)}
          aria-label={t("deleteNamed", { filename: doc.filename })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-error-light hover:text-error-dark"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-13 sm:hidden">
        <Badge tone={STATUS_TONE[doc.status]}>{statusLabel}</Badge>
      </div>

      {askDelete ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-m bg-error-light p-3 sm:ml-13">
          <p className="w-full text-paragraph-s text-error-dark">
            {t("deleteQuestion", { filename: doc.filename })}
          </p>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => void (await deletePortalDocumentAction(doc.id)))
            }
          >
            {t("deleteConfirm")}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAskDelete(false)}>
            {t("cancel")}
          </Button>
        </div>
      ) : null}

      {doc.review ? (
        <div className="mt-3 sm:ml-13">
          {reviewOpen ? (
            <ExtractionReviewCard extractions={[doc.review]} embedded />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setReviewOpen(true)}>
              {doc.status === "failed" ? t("showProblem") : t("review")}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Uploaded documents: status, view, delete, and the review of values still to confirm. */
export function DocumentList({ documents }: { documents: PortalDocument[] }) {
  const t = useTranslations("portal.documents");
  const tReview = useTranslations("documents.review");
  const router = useRouter();
  const [uploaded, setUploaded] = useState<ExtractionSummary[]>([]);
  const uploadedIds = new Set(uploaded.map((u) => u.documentId));
  const listed = documents.filter((d) => !uploadedIds.has(d.id));
  const waiting = documents.filter((d) => d.status === "extracted" && d.review).length;
  // Open the first review; the others wait behind a button so the page stays scannable.
  const firstWaiting = listed.find((d) => d.status === "extracted" && d.review);

  return (
    <PortalChatBridge>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <DocumentUploadButton
            variant="button"
            onUploaded={(docs) => {
              setUploaded((prev) => [
                ...docs.map(
                  (d): ExtractionSummary => ({
                    documentId: d.id,
                    filename: d.filename,
                    status: "uploaded",
                    docType: null,
                    fields: [],
                    description: null,
                    error: null,
                  }),
                ),
                ...prev,
              ]);
              router.refresh();
            }}
          />
          {waiting > 0 ? <Badge tone="warning">{t("waiting", { count: waiting })}</Badge> : null}
        </div>

        {uploaded.length > 0 ? (
          <div>
            <p className="sr-only">{tReview("title")}</p>
            <ExtractionReviewCard extractions={uploaded} />
          </div>
        ) : null}

        {listed.length === 0 && uploaded.length === 0 ? (
          <p className="rounded-xl bg-surface-muted p-5 text-paragraph-s text-fg-muted">
            {t("empty")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {listed.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} initiallyOpen={doc.id === firstWaiting?.id} />
            ))}
          </ul>
        )}

        <p className="flex items-start gap-2 text-paragraph-xs text-fg-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("encrypted")}
        </p>
      </div>
    </PortalChatBridge>
  );
}
