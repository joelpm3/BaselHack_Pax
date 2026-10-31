"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import {
  DocumentUploadButton,
  type UploadedDocument,
} from "@/components/documents/document-upload-button";
import { type ClaraActivity, ClaraAvatar } from "@/components/voice/clara-avatar";
import { type InputMode, setInputMode, useInputMode } from "@/components/voice/input-mode";
import { appendTranscript } from "@/components/voice/talk";
import { TalkDock } from "@/components/voice/talk-dock";
import { TranscriptReview } from "@/components/voice/transcript-review";
import { useSpaceToTalk } from "@/components/voice/use-space-to-talk";
import { useRecordingSupported, useVoiceRecorder } from "@/components/voice/use-voice-recorder";
import type { ClaraMood } from "@/lib/advisor/mood";
import type { AdvisorMessageMetadata } from "@/lib/advisor/types";
import { TextComposer } from "./text-composer";

/** What Clara is doing with the turn, and the mood she does it in (see ClaraAvatar). */
export interface ClaraTurn {
  activity: "thinking" | "answering" | null;
  mood: ClaraMood;
}

export interface ComposerProps {
  conversationId: string;
  busy: boolean;
  clara: ClaraTurn;
  quickReplies: string[];
  onSend: (text: string, metadata: AdvisorMessageMetadata) => void;
  onStop: () => void;
}

/** Talking first: browsers that cannot record fall back to writing. */
export function useEffectiveInputMode(): InputMode {
  const preferred = useInputMode();
  return useRecordingSupported() ? preferred : "text";
}

/**
 * Voice-first composer. Talking goes through the talk square and the transcript is sent as soon
 * as it is ready; only while the advisor is still answering does it wait in a card that can be
 * corrected. Writing is one tap away and remembered per device. Quick replies and the paperclip
 * work in both modes.
 */
export function Composer({
  conversationId,
  busy,
  clara,
  quickReplies,
  onSend,
  onStop,
}: ComposerProps) {
  const t = useTranslations("chat.composer");
  const mode = useEffectiveInputMode();
  const canRecord = useRecordingSupported();
  const [text, setText] = useState("");
  // The typed text came from a transcript moved over from the voice review.
  const [textFromVoice, setTextFromVoice] = useState(false);
  // A transcript that could not be sent yet (the advisor is answering, or more is being said).
  const [review, setReview] = useState<string | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [focusText, setFocusText] = useState(false);
  const meter = useRef<HTMLDivElement>(null);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const onTranscript = useCallback((transcript: string) => {
    // Switched to writing while the recording was still being transcribed.
    if (modeRef.current === "text") {
      setText((current) => appendTranscript(current, transcript));
      setTextFromVoice(true);
      return;
    }
    setReview((current) => appendTranscript(current ?? "", transcript));
  }, []);
  const onLevel = useCallback((level: number) => {
    meter.current?.style.setProperty("--level", level.toFixed(3));
  }, []);
  const recorder = useVoiceRecorder({ onTranscript, onLevel });
  const recording = recorder.phase === "recording";
  const idle = recorder.phase === "idle";
  // The customer speaking comes first: Clara listens with an open face, even mid-answer.
  const avatarActivity: ClaraActivity | null = recording
    ? "listening"
    : recorder.phase === "requesting" || recorder.phase === "transcribing"
      ? "thinking"
      : clara.activity;

  function send(value: string, metadata: AdvisorMessageMetadata): boolean {
    const trimmed = value.trim();
    if (!trimmed || busy) return false;
    onSend(trimmed, metadata);
    return true;
  }

  function clearReview() {
    setReview(null);
    setEditingReview(false);
  }

  function sendReview() {
    if (review !== null && send(review, { inputMode: "voice" })) clearReview();
  }

  // Sends the transcript by itself once nothing holds it back.
  const autoSend = review !== null && !busy && idle && !editingReview;
  const sendReviewRef = useRef(sendReview);
  useEffect(() => {
    sendReviewRef.current = sendReview;
  });
  useEffect(() => {
    if (autoSend) sendReviewRef.current();
  }, [autoSend]);

  function sendText() {
    if (send(text, { inputMode: textFromVoice ? "voice" : "text" })) {
      setText("");
      setTextFromVoice(false);
    }
  }

  function talk() {
    if (!idle) return;
    // Anything typed so far is kept and the spoken part is added to it.
    if (text.trim()) {
      setReview((current) => appendTranscript(current ?? "", text));
      setText("");
      setTextFromVoice(false);
    }
    setInputMode("voice");
    void recorder.start();
  }

  function write() {
    if (recording) recorder.cancel();
    recorder.clearError();
    if (review !== null) {
      setText((current) => appendTranscript(current, review));
      setTextFromVoice(true);
      clearReview();
    }
    setFocusText(true);
    setInputMode("text");
  }

  useSpaceToTalk(mode === "voice", {
    onToggle: () => (recording ? recorder.stop() : talk()),
    onEscape: () => {
      if (recording) recorder.cancel();
    },
  });

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

  const upload = (
    <DocumentUploadButton
      conversationId={conversationId}
      onUploaded={onUploaded}
      disabled={busy || recording}
    />
  );

  const showReplies = quickReplies.length > 0 && !busy && review === null && idle;

  return (
    <div className="flex flex-col gap-3">
      {showReplies ? (
        <ul aria-label={t("quickReplies")} className="flex flex-wrap gap-1.5">
          {quickReplies.map((reply) => (
            <li key={reply}>
              <button
                type="button"
                onClick={() => send(reply, { inputMode: "widget" })}
                className="min-h-9 rounded-full border-[1.5px] border-pax-purple bg-surface px-3.5 py-1.5 text-paragraph-xs font-medium text-pax-purple transition-colors hover:bg-light-purple"
              >
                {reply}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {mode === "voice" ? (
        <>
          {review !== null ? (
            <TranscriptReview
              text={review}
              onChange={setReview}
              onSend={sendReview}
              onDiscard={clearReview}
              editing={editingReview}
              onEdit={() => setEditingReview(true)}
              busy={busy}
            />
          ) : null}
          {/* The recorder sets `--level` here; the avatar and the square meter both read it. */}
          <div ref={meter} style={{ "--level": 0 } as CSSProperties}>
            <ClaraAvatar activity={avatarActivity} mood={recording ? "neutral" : clara.mood} />
            <TalkDock
              phase={recorder.phase}
              error={recorder.error}
              elapsedMs={recorder.elapsedMs}
              reviewing={review !== null}
              busy={busy}
              onTalk={talk}
              onDone={recorder.stop}
              onCancel={recorder.cancel}
              onWrite={write}
              onStopReply={onStop}
              onDismissError={recorder.clearError}
              upload={upload}
            />
          </div>
        </>
      ) : (
        <TextComposer
          text={text}
          onChange={(value) => {
            setText(value);
            if (!value.trim()) setTextFromVoice(false);
          }}
          onSend={sendText}
          onStop={onStop}
          onTalk={canRecord ? talk : undefined}
          busy={busy}
          autoFocus={focusText}
          upload={upload}
        />
      )}
    </div>
  );
}
