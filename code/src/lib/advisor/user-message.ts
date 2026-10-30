import { z } from "zod";
import type { AdvisorMessageMetadata } from "./types";

/**
 * What a client may send as a user message. Only text parts and a little metadata are accepted;
 * the server rebuilds the UI message so nobody can inject tool results or assistant content.
 */
export const userMessageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.literal("user"),
  parts: z
    .array(z.looseObject({ type: z.string() }))
    .min(1)
    .max(20),
  metadata: z
    .object({
      inputMode: z.enum(["text", "voice", "upload", "widget"]).optional(),
      documentIds: z.array(z.string().min(1).max(100)).max(10).optional(),
    })
    .partial()
    .optional(),
});

export const chatRequestSchema = z.object({
  id: z.string().min(1).max(100),
  message: userMessageSchema,
  trigger: z.enum(["submit-message", "regenerate-message"]).default("submit-message"),
});

const MAX_TEXT = 4000;

export function sanitizeUserMessage(input: z.infer<typeof userMessageSchema>) {
  const text = input.parts
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim()
    .slice(0, MAX_TEXT);
  if (!text) return null;
  const metadata: AdvisorMessageMetadata = {
    inputMode: input.metadata?.inputMode ?? "text",
    createdAt: Date.now(),
    ...(input.metadata?.documentIds?.length ? { documentIds: input.metadata.documentIds } : {}),
  };
  return {
    id: input.id,
    role: "user" as const,
    parts: [{ type: "text" as const, text }],
    metadata,
  };
}
