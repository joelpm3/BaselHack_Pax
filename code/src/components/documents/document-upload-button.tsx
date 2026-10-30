"use client";

import { Camera, FileUp, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ACCEPTED_MIME_TYPES } from "@/lib/documents/constants";
import { cn } from "@/lib/utils";
import { type UploadProblem, useDocumentUpload } from "./use-document-upload";

/**
 * CONTRACT (owned by the documents area): paperclip button for the chat composer. Uploads one or
 * more files (PDF/JPG/PNG/WebP, camera on mobile) to /api/documents and reports them back.
 */
export interface UploadedDocument {
  id: string;
  filename: string;
}

export interface DocumentUploadButtonProps {
  /** Links the documents to the conversation; omit for uploads from the cockpit. */
  conversationId?: string;
  onUploaded: (documents: UploadedDocument[]) => void;
  disabled?: boolean;
  /** "icon" (composer, default) or a labelled button (cockpit). */
  variant?: "icon" | "button";
  /** Where the file/camera menu opens; defaults to above for the icon, below for the button. */
  menuPlacement?: "top" | "bottom";
  className?: string;
}

const ACCEPT = ACCEPTED_MIME_TYPES.join(",");

function ProblemList({
  problems,
  onClose,
  placement,
}: {
  problems: UploadProblem[];
  onClose: () => void;
  placement: "top" | "bottom";
}) {
  const t = useTranslations("documents.upload");
  return (
    <div
      role="alert"
      className={cn(
        "absolute left-0 z-30 flex w-72 max-w-[calc(100vw-2rem)] gap-2 rounded-m border border-warning bg-warning-light p-3 text-paragraph-xs text-warning-dark",
        placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
      )}
    >
      <ul className="flex-1 space-y-1">
        {problems.map((p) => (
          <li key={`${p.filename}-${p.reason}`}>
            {p.reason === "network"
              ? t("failed")
              : t(`rejected.${p.reason}`, { filename: p.filename })}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose} aria-label={t("closeMessage")} className="self-start">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function DocumentUploadButton({
  conversationId,
  onUploaded,
  disabled,
  variant = "icon",
  menuPlacement,
  className,
}: DocumentUploadButtonProps) {
  const t = useTranslations("documents.upload");
  const { upload, uploading, problems, clearProblems } = useDocumentUpload(conversationId);
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const placement = menuPlacement ?? (variant === "icon" ? "top" : "bottom");

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !container.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setOpen(false);
    const documents = await upload(files);
    if (documents.length > 0) onUploaded(documents.map(({ id, filename }) => ({ id, filename })));
  }

  const pick = (input: HTMLInputElement | null) => {
    setOpen(false);
    input?.click();
  };

  return (
    <div ref={container} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => {
          clearProblems();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={variant === "icon" ? t("button") : undefined}
        title={variant === "icon" ? t("button") : undefined}
        className={
          variant === "icon"
            ? "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-gray-1 disabled:cursor-not-allowed disabled:text-gray-5"
            : buttonClasses("secondary", "sm")
        }
      >
        {uploading ? (
          <Spinner label={t("uploading")} />
        ) : variant === "icon" ? (
          <Paperclip className="size-5" aria-hidden />
        ) : (
          <>
            <FileUp aria-hidden />
            {t("button")}
          </>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute left-0 z-30 w-64 rounded-m border border-line bg-surface p-1.5",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(fileInput.current)}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-paragraph-s hover:bg-gray-1"
          >
            <FileUp className="size-5 text-pax-purple" aria-hidden />
            {t("chooseFile")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(cameraInput.current)}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-paragraph-s hover:bg-gray-1"
          >
            <Camera className="size-5 text-pax-purple" aria-hidden />
            {t("takePhoto")}
          </button>
          <p className="px-3 pt-1.5 pb-1 text-paragraph-xs text-fg-muted">{t("formats")}</p>
        </div>
      ) : null}

      {problems.length > 0 && !open ? (
        <ProblemList problems={problems} onClose={clearProblems} placement={placement} />
      ) : null}

      <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={handleFiles} />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFiles}
      />
    </div>
  );
}
