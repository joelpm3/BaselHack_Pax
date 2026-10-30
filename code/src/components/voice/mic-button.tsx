"use client";

import { CircleAlert, Mic, MicOff, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CSSProperties, useCallback, useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { MAX_RECORDING_MS } from "./types";
import { useRecordingSupported, useVoiceRecorder } from "./use-voice-recorder";

/**
 * CONTRACT (owned by the voice area): push-to-talk button for the chat composer. Records an
 * utterance, sends it to /api/transcribe (Swiss-German Nemotron) and returns the text, which the
 * composer puts into the input for the user to check before sending.
 */
export interface MicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

/** The level meter is a row of Pax squares; each lights up as the voice gets louder. */
const SQUARES = [0, 1, 2, 3, 4];
const WARN_FROM_MS = MAX_RECORDING_MS - 10_000;

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:text-gray-4 [&_svg]:size-5";

export function MicButton({ onTranscript, disabled = false }: MicButtonProps) {
  const t = useTranslations("voice");
  const supported = useRecordingSupported();
  const meter = useRef<HTMLSpanElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const onLevel = useCallback((level: number) => {
    meter.current?.style.setProperty("--level", level.toFixed(3));
  }, []);
  const { phase, error, elapsedMs, start, stop, cancel, clearError } = useVoiceRecorder({
    onTranscript,
    onLevel,
  });

  // Keyboard users land on "stop" as soon as the recording runs.
  useEffect(() => {
    if (phase === "recording") stopButton.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(clearError, 9000);
    return () => window.clearTimeout(id);
  }, [error, clearError]);

  const status =
    phase === "requesting"
      ? t("requesting")
      : phase === "recording"
        ? t("recording")
        : phase === "transcribing"
          ? t("transcribing")
          : "";

  return (
    <div className="relative inline-flex items-center">
      {phase === "recording" ? (
        <fieldset
          aria-label={t("recording")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className="m-0 flex h-11 min-w-0 items-center gap-2 rounded-full border-[1.2px] border-pax-purple bg-surface p-1"
        >
          <button
            type="button"
            onClick={cancel}
            aria-label={t("cancel")}
            title={t("cancel")}
            className={cn(iconButton, "size-9 text-fg hover:bg-gray-1")}
          >
            <X aria-hidden />
          </button>
          <span
            ref={meter}
            aria-hidden
            className="flex items-center gap-1"
            style={{ "--level": 0 } as CSSProperties}
          >
            {SQUARES.map((i) => (
              <span
                key={i}
                className="size-2.5 bg-pax-green"
                style={{ opacity: `clamp(0.18, calc(var(--level) * 5 - ${i}), 1)` }}
              />
            ))}
          </span>
          <span
            className={cn(
              "min-w-[2.6rem] text-paragraph-xs tabular-nums",
              elapsedMs >= WARN_FROM_MS ? "font-medium text-warning-dark" : "text-fg-muted",
            )}
          >
            <span className="sr-only">{t("elapsedLabel")} </span>
            {formatTime(elapsedMs)}
          </span>
          <button
            ref={stopButton}
            type="button"
            onClick={stop}
            aria-label={t("stop")}
            title={t("stop")}
            className={cn(
              iconButton,
              "size-9 bg-pax-purple text-white hover:bg-deep-purple [&_svg]:size-3.5",
            )}
          >
            <Square aria-hidden fill="currentColor" />
          </button>
        </fieldset>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={disabled || phase !== "idle"}
          aria-label={phase === "transcribing" ? t("transcribing") : t("start")}
          title={supported ? t("startHint") : t("errors.not_supported")}
          className={cn(iconButton, "text-fg hover:bg-gray-1")}
        >
          {phase === "idle" ? (
            supported ? (
              <Mic aria-hidden />
            ) : (
              <MicOff aria-hidden />
            )
          ) : (
            <Spinner label={status} />
          )}
        </button>
      )}

      <output className="sr-only">{status}</output>

      {error ? (
        <div
          role="alert"
          className="absolute right-0 bottom-full z-20 mb-2 flex w-[min(18rem,calc(100vw-2rem))] items-start gap-2 rounded-m bg-light-purple p-3 text-paragraph-xs text-deep-purple"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{t(`errors.${error}`)}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label={t("dismiss")}
            className="-m-1 rounded-sm p-1 hover:bg-white/60"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
