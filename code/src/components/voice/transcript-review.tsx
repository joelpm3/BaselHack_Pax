"use client";

import { ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef } from "react";

export interface TranscriptReviewProps {
  text: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onDiscard: () => void;
  /** Editing holds the transcript until the customer sends it. */
  editing: boolean;
  onEdit: () => void;
  /** The advisor is answering, so sending is not possible yet. */
  busy: boolean;
}

/**
 * A transcript that cannot go out yet because the advisor is still answering. The composer
 * sends it as soon as the answer is done; until then it can be corrected or discarded.
 */
export function TranscriptReview({
  text,
  onChange,
  onSend,
  onDiscard,
  editing,
  onEdit,
  busy,
}: TranscriptReviewProps) {
  const t = useTranslations("voice.review");
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = field.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!busy && text.trim()) onSend();
    }
  }

  const note = editing ? t("editing") : t("afterReply");

  return (
    <section
      aria-label={t("title")}
      className="rounded-xl border-[1.5px] border-pax-purple bg-surface p-3"
    >
      <h2 className="text-paragraph-xs font-medium text-pax-purple">{t("title")}</h2>

      {editing ? (
        <>
          <label htmlFor="voice-transcript" className="sr-only">
            {t("editLabel")}
          </label>
          <textarea
            ref={field}
            id="voice-transcript"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            enterKeyHint="send"
            className="mt-1.5 max-h-48 min-h-12 w-full resize-none [field-sizing:content] rounded-m border border-line-strong bg-surface px-2.5 py-2 text-[1rem] leading-6 focus:border-pax-purple focus:outline-none"
          />
        </>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="mt-1 block w-full text-left text-paragraph-m leading-6 text-deep-purple"
        >
          <span className="sr-only">{t("editLabel")}: </span>
          <span className="line-clamp-6 whitespace-pre-wrap break-words">«{text}»</span>
        </button>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-paragraph-xs text-fg-muted">{note}</p>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onDiscard}
            title={t("discard")}
            className="inline-flex size-9 items-center justify-center rounded-m text-fg hover:bg-gray-1"
          >
            <Trash2 aria-hidden className="size-4" />
            <span className="sr-only">{t("discard")}</span>
          </button>
          {!editing ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-9 items-center gap-1.5 rounded-m px-2.5 text-paragraph-s text-fg hover:bg-gray-1"
            >
              <Pencil aria-hidden className="size-4" />
              {t("edit")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSend}
            disabled={busy || !text.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-m bg-pax-purple px-3 text-paragraph-s font-medium text-white hover:bg-deep-purple disabled:bg-gray-3"
          >
            <ArrowUp aria-hidden className="size-4" />
            {t("send")}
          </button>
        </div>
      </div>
    </section>
  );
}
