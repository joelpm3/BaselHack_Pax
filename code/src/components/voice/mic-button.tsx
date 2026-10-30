"use client";

/**
 * CONTRACT (owned by the voice area): push-to-talk button for the chat composer. Records an
 * utterance, sends it to /api/transcribe (Swiss-German Nemotron) and returns the text, which the
 * composer puts into the input for the user to check before sending.
 */
export interface MicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function MicButton(_props: MicButtonProps) {
  return null;
}
