import { getToolName, isToolUIPart, type UIMessage } from "ai";

/** The faces Clara's avatar can make. Client-safe: the chat derives the answer's mood live. */
export const CLARA_MOODS = ["neutral", "happy", "curious", "empathetic", "confident"] as const;
export type ClaraMood = (typeof CLARA_MOODS)[number];

/** What the customer's message can call for; "confident" only ever comes from Clara's answer. */
export const REQUEST_MOODS = ["neutral", "happy", "curious", "empathetic"] as const;
export type RequestMood = (typeof REQUEST_MOODS)[number];

/** A recommendation or an offer: Clara stands behind what she proposes. */
const CONFIDENT_TOOLS = new Set(["recommendProducts", "prepareOffer"]);

/**
 * The mood of Clara's answer so far, starting from the customer's request. A worry or good news
 * in the request keeps its face while she answers; otherwise a proposal makes her confident and a
 * question curious.
 */
export function answerMood(request: RequestMood, parts: UIMessage["parts"]): ClaraMood {
  const proposes = parts.some(
    (part) => isToolUIPart(part) && CONFIDENT_TOOLS.has(getToolName(part)),
  );
  if (proposes) return "confident";
  if (request === "empathetic" || request === "happy") return request;
  const asks = parts.some((part) => part.type === "text" && part.text.includes("?"));
  return asks ? "curious" : request;
}
