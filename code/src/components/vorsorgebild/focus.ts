import type { PictureKind } from "@/lib/advisor/types";

/**
 * Which situation the Vorsorgebild shows. Clara's messages move it to the situation she talks
 * about; a tab the customer picks wins until her next message. A pick while she is still
 * answering wins over that answer too: it came after the question they were reading.
 */
export interface PictureFocus {
  kind: PictureKind | null;
  /** The situation came from Clara's latest message (shown as "being discussed"). */
  byAdvisor: boolean;
  /** Counts Clara's switches, so the cue can play again for every one. */
  seq: number;
  /** The customer picked a tab since they last sent a message. */
  pickedThisTurn: boolean;
}

export type FocusEvent =
  | { type: "send" }
  | { type: "pick"; kind: PictureKind }
  | { type: "advisor"; kind: PictureKind | null };

export function initialFocus(kind: PictureKind | null): PictureFocus {
  return { kind, byAdvisor: kind !== null, seq: 0, pickedThisTurn: false };
}

export function focusReducer(state: PictureFocus, event: FocusEvent): PictureFocus {
  switch (event.type) {
    case "send":
      return state.pickedThisTurn ? { ...state, pickedThisTurn: false } : state;
    case "pick":
      return { ...state, kind: event.kind, byAdvisor: false, pickedThisTurn: true };
    case "advisor":
      if (state.pickedThisTurn) return state;
      if (event.kind === null) return state.byAdvisor ? { ...state, byAdvisor: false } : state;
      return { ...state, kind: event.kind, byAdvisor: true, seq: state.seq + 1 };
  }
}
