"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
  type TranscribeErrorCode,
  type TranscribeResponse,
} from "./types";

export type RecorderPhase = "idle" | "requesting" | "recording" | "transcribing";
export type RecorderError =
  | TranscribeErrorCode
  | "permission"
  | "no_microphone"
  | "not_supported"
  | "nothing_heard";

/** Opus in webm where available; iOS Safari only records mp4/AAC. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function supported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}
const noopSubscribe = () => () => {};

/** False only on the client when the browser (or an insecure http origin) cannot record. */
export function useRecordingSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, supported, () => true);
}

function mediaError(error: unknown): RecorderError {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError")
    return "no_microphone";
  return "not_supported";
}

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  audio: AudioContext | null;
  chunks: Blob[];
  startedAt: number;
  cancelled: boolean;
  frame: number;
  timer: number;
}

export interface VoiceRecorderOptions {
  onTranscript: (text: string) => void;
  /** Called every animation frame while recording with the input level 0–1. */
  onLevel?: (level: number) => void;
}

/**
 * Tap-to-start / tap-to-stop recorder: MediaRecorder for the audio, an AnalyserNode for the
 * level, a hard stop at 60 s, then POST /api/transcribe. The level goes to a callback instead
 * of state so the meter can update the DOM without re-rendering every frame.
 */
export function useVoiceRecorder({ onTranscript, onLevel }: VoiceRecorderOptions) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const session = useRef<Session | null>(null);
  const request = useRef<AbortController | null>(null);
  const callbacks = useRef({ onTranscript, onLevel });
  useEffect(() => {
    callbacks.current = { onTranscript, onLevel };
  });

  const release = useCallback(() => {
    const s = session.current;
    if (!s) return;
    cancelAnimationFrame(s.frame);
    window.clearInterval(s.timer);
    for (const track of s.stream.getTracks()) track.stop();
    void s.audio?.close().catch(() => {});
    session.current = null;
  }, []);

  const send = useCallback(async (blob: Blob, durationMs: number) => {
    setPhase("transcribing");
    const controller = new AbortController();
    request.current = controller;
    const form = new FormData();
    form.append("file", blob, "speech");
    form.append("durationMs", String(Math.round(durationMs)));
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const payload = (await res.json().catch(() => ({ error: "failed" }))) as TranscribeResponse;
      if ("error" in payload) setError(payload.error);
      else if (!payload.text) setError("nothing_heard");
      else callbacks.current.onTranscript(payload.text);
    } catch {
      if (!controller.signal.aborted) setError("unavailable");
    } finally {
      if (request.current === controller) request.current = null;
      setPhase("idle");
    }
  }, []);

  const stop = useCallback(() => {
    const s = session.current;
    if (s && s.recorder.state !== "inactive") s.recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    if (session.current) session.current.cancelled = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (session.current || request.current) return;
    setError(null);
    if (!supported()) {
      setError("not_supported");
      return;
    }
    setPhase("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (cause) {
      setError(mediaError(cause));
      setPhase("idle");
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined,
    );
    const s: Session = {
      stream,
      recorder,
      audio: null,
      chunks: [],
      startedAt: performance.now(),
      cancelled: false,
      frame: 0,
      timer: 0,
    };
    session.current = s;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) s.chunks.push(event.data);
    };
    recorder.onstop = () => {
      const duration = performance.now() - s.startedAt;
      const blob = new Blob(s.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      const cancelled = s.cancelled;
      release();
      setElapsedMs(0);
      if (cancelled) setPhase("idle");
      else if (duration < MIN_RECORDING_MS) {
        setError("too_short");
        setPhase("idle");
      } else void send(blob, duration);
    };

    // Level meter: RMS of the waveform, eased so the squares do not flicker.
    try {
      const audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(stream).connect(analyser);
      s.audio = audio;
      const samples = new Float32Array(analyser.fftSize);
      let level = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const rms = Math.sqrt(sum / samples.length);
        level = Math.max(Math.min(1, rms * 6), level * 0.85);
        callbacks.current.onLevel?.(level);
        s.frame = requestAnimationFrame(tick);
      };
      s.frame = requestAnimationFrame(tick);
    } catch {
      // Recording still works without a level meter.
    }

    s.timer = window.setInterval(() => {
      const elapsed = performance.now() - s.startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) stop();
    }, 250);

    recorder.start(250);
    setElapsedMs(0);
    setPhase("recording");
  }, [release, send, stop]);

  useEffect(
    () => () => {
      const s = session.current;
      if (s) {
        s.cancelled = true;
        if (s.recorder.state !== "inactive") s.recorder.stop();
      }
      release();
      request.current?.abort();
    },
    [release],
  );

  return {
    phase,
    error,
    elapsedMs,
    start,
    stop,
    cancel,
    clearError: useCallback(() => setError(null), []),
  };
}
