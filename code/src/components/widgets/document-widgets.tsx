"use client";

import { FileSearch, FileText, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useChatActions } from "@/components/chat/chat-actions";
import { DocumentUploadButton } from "@/components/documents/document-upload-button";
import { ExtractionReviewCard } from "@/components/documents/extraction-review-card";
import { Button } from "@/components/ui/button";
import type { DocumentUploadPromptOutput } from "@/lib/advisor/types";
import type { ExtractionSummary } from "@/lib/documents/types";
import type { WidgetProps } from "./types";
import { WidgetCard, WidgetFailed, WidgetPending } from "./widget-card";

const KNOWN_TYPES = new Set(["pension_certificate", "insurance_policy", "salary_certificate"]);

/** The document shortcut: upload instead of answering number questions, or skip. */
export function DocumentUploadPrompt({ state, output }: WidgetProps) {
  const t = useTranslations("widgets.upload");
  const tc = useTranslations("chat.composer");
  const { conversationId, busy, sendMessage } = useChatActions();
  if (state === "output-error") return null;
  if (state !== "output-available") return <WidgetPending icon={FileText} label={t("title")} />;
  const types = ((output as DocumentUploadPromptOutput | undefined)?.documentTypes ?? []).filter(
    (type) => KNOWN_TYPES.has(type),
  );

  return (
    <WidgetCard icon={FileText} title={t("title")}>
      <p className="text-paragraph-s">{t("body")}</p>
      {types.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {types.map((type) => (
            <li key={type} className="flex items-start gap-2.5 text-paragraph-s">
              <span aria-hidden className="mt-1.5 size-2 shrink-0 bg-pax-green" />
              <span>
                <span className="font-medium">{t(`types.${type}.name`)}</span>
                <span className="text-fg-muted"> {t(`types.${type}.why`)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <DocumentUploadButton
          conversationId={conversationId}
          disabled={busy}
          variant="button"
          onUploaded={(documents) => {
            if (documents.length === 0) return;
            sendMessage(
              tc("uploaded", {
                count: documents.length,
                names: documents.map((d) => d.filename).join(", "),
              }),
              { inputMode: "upload", documentIds: documents.map((d) => d.id) },
            );
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => sendMessage(t("skipMessage"))}
        >
          {t("skip")}
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-paragraph-xs text-fg-muted">
        <Lock aria-hidden className="size-3.5" />
        {t("privacy")}
      </p>
    </WidgetCard>
  );
}

/** Wraps the documents area's review card ("Das habe ich gelesen"). */
export function DocumentReviewWidget({ state, output }: WidgetProps) {
  const t = useTranslations("widgets.review");
  if (state === "output-error") return <WidgetFailed icon={FileSearch} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={FileSearch} label={t("pending")} />;
  const extractions = (output as { extractions?: ExtractionSummary[] } | undefined)?.extractions;
  if (!Array.isArray(extractions) || extractions.length === 0) return null;
  return <ExtractionReviewCard extractions={extractions} />;
}
