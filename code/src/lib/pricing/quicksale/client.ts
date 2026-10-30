import "server-only";
import { env } from "@/env";
import type { QuoteInput } from "../types";
import { deeplinkAction, STEPS } from "./mapping";
import type { QsAction, QsProduct, QsProposal, QsResponse } from "./types";

/**
 * Client for the public Pax Quicksale demo backend (portal.pax.ch/quicksale/edu). This is Pax's
 * production demo, so it is used gently: one session per quote, actions strictly sequential,
 * at most two quotes in flight, a 10 s timeout per request and a cool-down after failures.
 * CORS only allows portal.pax.ch, so this only runs on the server.
 */

const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 2;
const COOLDOWN_MS = 60_000;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  admnr: "0",
  benutzergruppe: "0",
  rdnr: "0",
  sex: "1",
  username: "PublicUser",
};

export class QuicksaleError extends Error {
  constructor(
    message: string,
    readonly step: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QuicksaleError";
  }
}

interface ClientState {
  active: number;
  waiting: Array<() => void>;
  unavailableUntil: number;
}
const globalForQs = globalThis as unknown as { paxQuicksale?: ClientState };
const state: ClientState = globalForQs.paxQuicksale ?? {
  active: 0,
  waiting: [],
  unavailableUntil: 0,
};
globalForQs.paxQuicksale = state;

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (state.active >= MAX_CONCURRENT)
    await new Promise<void>((resolve) => state.waiting.push(resolve));
  state.active++;
  try {
    return await fn();
  } finally {
    state.active--;
    state.waiting.shift()?.();
  }
}

async function call(step: string, path: string, init: RequestInit = {}): Promise<QsResponse> {
  let res: Response;
  try {
    res = await fetch(`${env.QUICKSALE_BASE_URL}${path}`, {
      ...init,
      headers: { ...HEADERS, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    throw new QuicksaleError(cause instanceof Error ? cause.message : String(cause), step);
  }
  const payload = (await res.json().catch(() => null)) as QsResponse | null;
  if (!res.ok || !payload || payload.state !== "SUCCESS" || !payload.data) {
    throw new QuicksaleError(payload?.message || `HTTP ${res.status}`, step, res.status);
  }
  return payload;
}

async function post(step: string, sessionId: string, action: QsAction): Promise<QsProposal> {
  const res = await call(step, "/api/vorschlaege", {
    method: "POST",
    body: JSON.stringify({ vorschlag: { ...action, sessionId } }),
  });
  return res.data as QsProposal;
}

export interface QuicksaleRun {
  proposal: QsProposal;
  sessionId: string;
  /** Action keys sent after the session was opened, in order (for the audit trail). */
  actions: string[];
}

/** Opens a session, deeplinks the product and applies only the changes the input needs. */
export async function runQuicksale(product: QsProduct, input: QuoteInput): Promise<QuicksaleRun> {
  if (Date.now() < state.unavailableUntil) {
    throw new QuicksaleError("Quicksale cooling down after an error", "cooldown");
  }
  return withSlot(async () => {
    try {
      const defaults = await call("session", "/api/defaults/vorschlag");
      const sessionId = defaults.data?.sessionId;
      if (!sessionId) throw new QuicksaleError("No session id", "session");
      const actions = ["DEEPLINK"];
      let proposal = await post("deeplink", sessionId, deeplinkAction(product));
      for (const step of STEPS) {
        const action = step.plan(proposal, input);
        if (!action) continue;
        actions.push(action.aktion.key);
        proposal = await post(step.name, sessionId, action);
      }
      return { proposal, sessionId, actions };
    } catch (error) {
      // Network trouble or server errors: stop calling for a minute and use the estimate.
      if (!(error instanceof QuicksaleError) || !error.status || error.status >= 500) {
        state.unavailableUntil = Date.now() + COOLDOWN_MS;
      }
      throw error;
    }
  });
}
