"use client";

import { CircleAlert, Keyboard, Mic, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { LevelMeter } from "./level-meter";
import { MAX_RECORDING_MS } from "./types";
import type { RecorderError, RecorderPhase } from "./use-voice-recorder";

const WARN_FROM_MS = MAX_RECORDING_MS - 10_000;

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface TalkDockProps {
  phase: RecorderPhase;
  error: RecorderError | null;
  elapsedMs: number;
  /** Receives `--level` from the recorder for the square meter. */
  meterRef: RefObject<HTMLDivElement | null>;
  /** A transcript waits for review: the talk button then adds to it. */
  reviewing: boolean;
  /** The advisor is answering: talking is allowed, sending waits. */
  busy: boolean;
  onTalk: () => void;
  onDone: () => void;
  onCancel: () => void;
  onWrite: () => void;
  onStopReply: () => void;
  onDismissError: () => void;
  /** The paperclip, owned by the documents area. */
  upload: ReactNode;
}

const sideCaption = "text-paragraph-xs leading-4 text-fg-muted";
const sideButton =
  "inline-flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-gray-1 [&_svg]:size-5";

/** The voice-first control bar: one large talk square, the paperclip and "Schreiben" beside it. */
export function TalkDock({
  phase,
  error,
  elapsedMs,
  meterRef,
  reviewing,
  busy,
  onTalk,
  onDone,
  onCancel,
  onWrite,
  onStopReply,
  onDismissError,
  upload,
}: TalkDockProps) {
  const t = useTranslations("voice");
  const recording = phase === "recording";
  const working = phase === "requesting" || phase === "transcribing";

  const status = recording
    ? t("talk.listening")
    : phase === "requesting"
      ? t("requesting")
      : phase === "transcribing"
        ? t("transcribing")
        : busy
          ? t("talk.busy")
          : reviewing
            ? t("talk.reviewing")
            : "";
  const idleHint = status === "";

  const caption = recording
    ? t("talk.done")
    : working
      ? t("talk.wait")
      : reviewing
        ? t("talk.more")
        : t("talk.start");

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-m bg-light-purple px-3 py-2.5 text-paragraph-s text-deep-purple"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <p>{t(`errors.${error}`)}</p>
            <button
              type="button"
              onClick={onWrite}
              className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
            >
              <Keyboard aria-hidden className="size-4" />
              {t("talk.writeInstead")}
            </button>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            aria-label={t("dismiss")}
            className="-m-1 rounded-sm p-1 hover:bg-white/60"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}

      <div
        ref={meterRef}
        className="grid grid-cols-[4rem_minmax(0,1fr)_auto_minmax(0,1fr)_4rem] items-start gap-x-2"
        style={{ "--level": 0 } as CSSProperties}
      >
        <div className="flex flex-col items-center gap-0.5">
          {recording ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                aria-label={t("cancel")}
                className={sideButton}
              >
                <X aria-hidden />
              </button>
              <span aria-hidden className={sideCaption}>
                {t("talk.discard")}
              </span>
            </>
          ) : (
            <>
              {upload}
              <span aria-hidden className={sideCaption}>
                {t("talk.document")}
              </span>
            </>
          )}
        </div>

        <div className="flex h-[4.5rem] items-center justify-end">
          <LevelMeter side="left" active={recording} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={recording ? onDone : onTalk}
            disabled={working}
            aria-label={recording ? t("stop") : reviewing ? t("talk.moreLabel") : t("start")}
            aria-keyshortcuts="Space"
            className={cn(
              "grid size-[4.5rem] place-items-center rounded-m text-white transition-colors",
              recording
                ? "bg-deep-purple outline-[3px] outline-offset-2 outline-pax-green outline-solid"
                : "bg-pax-purple hover:bg-deep-purple",
              working && "bg-light-purple",
            )}
          >
            {recording ? (
              <Square aria-hidden className="size-6 fill-current" />
            ) : working ? (
              <Spinner label={status} />
            ) : (
              <Mic aria-hidden className="size-8" strokeWidth={1.75} />
            )}
          </button>
          <span aria-hidden className="text-paragraph-xs leading-4 font-medium text-pax-purple">
            {caption}
          </span>
        </div>

        <div className="flex h-[4.5rem] items-center justify-start">
          <LevelMeter side="right" active={recording} />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          {busy && !recording ? (
            <>
              <button type="button" onClick={onStopReply} className={sideButton}>
                <Square aria-hidden className="!size-3.5 fill-current" />
                <span className="sr-only">{t("talk.stopReplyLabel")}</span>
              </button>
              <span aria-hidden className={sideCaption}>
                {t("talk.stopReply")}
              </span>
            </>
          ) : recording ? (
            <span
              className={cn(
                "flex h-11 items-center text-paragraph-s tabular-nums",
                elapsedMs >= WARN_FROM_MS ? "font-medium text-warning-dark" : "text-fg-muted",
              )}
            >
              <span className="sr-only">{t("elapsedLabel")} </span>
              {formatTime(elapsedMs)}
            </span>
          ) : (
            <>
              <button type="button" onClick={onWrite} className={sideButton}>
                <Keyboard aria-hidden />
                <span className="sr-only">{t("talk.writeLabel")}</span>
              </button>
              <span aria-hidden className={sideCaption}>
                {t("talk.write")}
              </span>
            </>
          )}
        </div>
      </div>

      <output aria-live="polite" className="block text-center text-paragraph-xs text-fg-muted">
        {idleHint ? (
          <>
            <span className="pointer-fine:hidden">{t("talk.idle")}</span>
            <span className="hidden pointer-fine:inline">
              {t.rich("talk.idleKeys", {
                key: (chunks) => (
                  <kbd className="rounded-sm border border-line px-1 font-sans text-fg">
                    {chunks}
                  </kbd>
                ),
              })}
            </span>
          </>
        ) : (
          status
        )}
      </output>
    </div>
  );
}
