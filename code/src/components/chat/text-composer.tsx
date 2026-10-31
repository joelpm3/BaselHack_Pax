"use client";

import { ArrowUp, Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

export interface TextComposerProps {
  text: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** Back to talking (absent when the browser cannot record). */
  onTalk?: () => void;
  busy: boolean;
  /** Focus the field on mount, when the customer just chose to write. */
  autoFocus: boolean;
  /** The paperclip, owned by the documents area. */
  upload: ReactNode;
}

/** The writing alternative: paperclip, a growing text field, "Sprechen" and send. */
export function TextComposer({
  text,
  onChange,
  onSend,
  onStop,
  onTalk,
  busy,
  autoFocus,
  upload,
}: TextComposerProps) {
  const t = useTranslations("chat.composer");
  const tv = useTranslations("voice.talk");
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const el = field.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-1 rounded-xl border-[1.2px] border-line-strong bg-surface p-1.5 focus-within:border-pax-purple"
    >
      {upload}
      <label htmlFor="chat-input" className="sr-only">
        {t("label")}
      </label>
      <textarea
        ref={field}
        id="chat-input"
        rows={1}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t("placeholder")}
        enterKeyHint="send"
        className="max-h-40 min-h-10 flex-1 resize-none [field-sizing:content] bg-transparent px-2 py-2 text-[1rem] leading-6 placeholder:text-fg-subtle focus:outline-none"
      />
      {onTalk ? (
        <button
          type="button"
          onClick={onTalk}
          title={tv("speakLabel")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-pax-purple transition-colors hover:bg-light-purple"
        >
          <Mic aria-hidden className="size-5" />
          <span className="sr-only">{tv("speakLabel")}</span>
        </button>
      ) : null}
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white"
        >
          <Square aria-hidden className="size-3.5 fill-current" />
          <span className="sr-only">{t("stop")}</span>
        </button>
      ) : (
        <button
          type="submit"
          disabled={!text.trim()}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-pax-green text-ink transition-colors hover:bg-contrast-green hover:text-white disabled:bg-gray-3"
        >
          <ArrowUp aria-hidden className="size-5" />
          <span className="sr-only">{t("send")}</span>
        </button>
      )}
    </form>
  );
}
