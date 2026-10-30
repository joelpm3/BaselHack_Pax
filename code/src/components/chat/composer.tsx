"use client";

import { ArrowUp, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import {
  DocumentUploadButton,
  type UploadedDocument,
} from "@/components/documents/document-upload-button";
import { MicButton } from "@/components/voice/mic-button";
import type { AdvisorMessageMetadata } from "@/lib/advisor/types";

export interface ComposerProps {
  conversationId: string;
  busy: boolean;
  quickReplies: string[];
  onSend: (text: string, metadata: AdvisorMessageMetadata) => void;
  onStop: () => void;
}

/** Text, voice (transcript goes into the field, never auto-sent) and the upload paperclip. */
export function Composer({ conversationId, busy, quickReplies, onSend, onStop }: ComposerProps) {
  const t = useTranslations("chat.composer");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  function send(value: string, metadata: AdvisorMessageMetadata) {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSend(trimmed, metadata);
    setText("");
    setVoice(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(text, { inputMode: voice ? "voice" : "text" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(text, { inputMode: voice ? "voice" : "text" });
    }
  }

  function onTranscript(transcript: string) {
    setText((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
    setVoice(true);
    field.current?.focus();
  }

  function onUploaded(documents: UploadedDocument[]) {
    if (documents.length === 0) return;
    onSend(
      t("uploaded", {
        count: documents.length,
        names: documents.map((d) => d.filename).join(", "),
      }),
      { inputMode: "upload", documentIds: documents.map((d) => d.id) },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {quickReplies.length > 0 && !busy ? (
        <ul aria-label={t("quickReplies")} className="flex flex-wrap gap-1.5">
          {quickReplies.map((reply) => (
            <li key={reply}>
              <button
                type="button"
                onClick={() => send(reply, { inputMode: "widget" })}
                className="rounded-full border-[1.5px] border-pax-purple bg-surface px-3.5 py-1.5 text-paragraph-xs font-medium text-pax-purple transition-colors hover:bg-light-purple"
              >
                {reply}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        onSubmit={submit}
        className="flex items-end gap-1 rounded-[20px] border-[1.2px] border-line-strong bg-surface p-1.5 focus-within:border-pax-purple"
      >
        <DocumentUploadButton
          conversationId={conversationId}
          onUploaded={onUploaded}
          disabled={busy}
        />
        <label htmlFor="chat-input" className="sr-only">
          {t("label")}
        </label>
        <textarea
          ref={field}
          id="chat-input"
          rows={1}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (!event.target.value.trim()) setVoice(false);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          enterKeyHint="send"
          className="max-h-40 min-h-10 flex-1 resize-none [field-sizing:content] bg-transparent px-2 py-2 text-[1rem] leading-6 placeholder:text-fg-subtle focus:outline-none"
        />
        <MicButton onTranscript={onTranscript} disabled={busy} />
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
            className="grid size-10 shrink-0 place-items-center rounded-full bg-pax-purple text-white transition-colors hover:bg-deep-purple disabled:bg-gray-3"
          >
            <ArrowUp aria-hidden className="size-5" />
            <span className="sr-only">{t("send")}</span>
          </button>
        )}
      </form>
    </div>
  );
}
