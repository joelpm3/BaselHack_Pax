/** Error codes of POST /api/transcribe; the mic button translates them (`voice.errors.*`). */
export type TranscribeErrorCode =
  | "unauthorized"
  | "invalid"
  | "empty"
  | "too_large"
  | "too_long"
  | "too_short"
  | "unsupported"
  | "busy"
  | "unavailable"
  | "starting"
  | "unreadable"
  | "failed";

export type TranscribeResponse = { text: string } | { error: TranscribeErrorCode };

/** Recording limits shared by the button and the route. */
export const MAX_RECORDING_MS = 60_000;
export const MIN_RECORDING_MS = 400;
