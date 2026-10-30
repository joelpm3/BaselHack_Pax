import "server-only";
import { env } from "@/env";
import { db, schema } from "@/lib/db";

/**
 * Thin client for the Logismata APICalc engine (Swiss pension/tax calculations).
 * Every call is recorded in `calculations` so recommendations stay auditable.
 * Operation reference: challenge_context/LOGISMATA_API.md, examples in challenge_context/api/examples.
 */

export class LogismataError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LogismataError";
  }
}

export interface CallContext {
  customerId?: string;
  conversationId?: string;
  toolCallId?: string;
}

const TIMEOUT_MS = 15_000;

export async function callLogismata<TResponse>(
  operation: string,
  body: Record<string, unknown>,
  context: CallContext = {},
): Promise<TResponse> {
  if (!env.LOGISMATA_API_TOKEN) {
    throw new LogismataError("LOGISMATA_API_TOKEN is not configured", operation);
  }
  const started = Date.now();
  let output: unknown;
  let error: string | undefined;
  try {
    const res = await fetch(`${env.LOGISMATA_API_BASE}/operation/standard/${operation}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LOGISMATA_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = (await res.json().catch(() => null)) as {
      response?: TResponse;
      error?: { message?: string };
    } | null;
    if (!res.ok || !payload || payload.error || payload.response === undefined) {
      error = payload?.error?.message ?? `HTTP ${res.status}`;
      throw new LogismataError(error, operation, res.status);
    }
    output = payload.response;
    return payload.response;
  } catch (cause) {
    error ??= cause instanceof Error ? cause.message : String(cause);
    throw cause instanceof LogismataError ? cause : new LogismataError(error, operation);
  } finally {
    db.insert(schema.calculations)
      .values({
        customerId: context.customerId,
        conversationId: context.conversationId,
        toolCallId: context.toolCallId,
        provider: "logismata",
        operation,
        input: body,
        output: output ?? null,
        status: error ? "error" : "ok",
        error,
        durationMs: Date.now() - started,
      })
      .run();
  }
}

/** Enum mappings used by most APICalc operations. */
export const LOGISMATA = {
  sex: { male: 1, female: 2 },
  relationship: { single: 1, married: 2, cohabiting: 3, registered_partnership: 4 },
  language: { de: 1, fr: 2, it: 3, en: 4 },
  incomeType: { gross: 1, taxable: 2, net: 3 },
  confession: { none: 4 },
} as const;
