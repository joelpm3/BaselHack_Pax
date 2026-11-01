/**
 * Replays recorded Logismata and Pax Quicksale responses for the browser tests, so they run
 * without the Logismata token and without touching Pax's Quicksale demo backend.
 *
 *   /logismata/operation/standard/<op>   POST   (LOGISMATA_API_BASE=http://127.0.0.1:3242/logismata)
 *   /quicksale/api/defaults/vorschlag     GET    (QUICKSALE_BASE_URL=http://127.0.0.1:3242/quicksale)
 *   /quicksale/api/vorschlaege            POST
 *
 * Lookup: the exact request first; otherwise the recorded request of the same operation (or
 * Quicksale action) that shares the most values, so a date that moved since the recording (the
 * contract start is always the first of next month) still gets an answer. Quicksale is a session
 * API: a session replays the proposals recorded for the product it opened.
 *
 * Recording (once, with the real token): `E2E_RECORD=1 pnpm test:e2e` forwards every call
 * upstream (token from LOGISMATA_UPSTREAM_TOKEN or .env.local) and adds what is new to
 * e2e/fixtures/{logismata,quicksale}.json. Only request bodies (the fictional personas' figures)
 * and responses are stored, never the token.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

const PORT = Number(process.env.E2E_FIXTURE_PORT ?? 3242);
const RECORD = process.env.E2E_RECORD === "1";
const FIXTURES = path.join(import.meta.dirname, "..", "fixtures");
const LOGISMATA_UPSTREAM = "https://baselhackathon2026.azurewebsites.net/viper";
const QUICKSALE_UPSTREAM = "https://portal.pax.ch/quicksale/edu";

type Json = unknown;

interface LogismataRecord {
  operation: string;
  request: Json;
  status: number;
  response: Json;
}

interface QuicksaleRecord {
  /** Product the session deeplinked, e.g. "FK" or "TzaLifeStar". */
  product: string;
  /** The action key, e.g. DEEPLINK, GEBURTSDATUM_AENDERN. */
  action: string;
  request: Json;
  response: Json;
}

interface QuicksaleFixtures {
  defaults: Json;
  calls: QuicksaleRecord[];
}

function load<T>(file: string, empty: T): T {
  try {
    return JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8")) as T;
  } catch {
    return empty;
  }
}

function save(file: string, data: unknown) {
  writeFileSync(path.join(FIXTURES, file), `${JSON.stringify(data, null, 1)}\n`);
}

/** The real token, only for recording: LOGISMATA_UPSTREAM_TOKEN or the one in .env.local. */
function upstreamToken(): string {
  if (process.env.LOGISMATA_UPSTREAM_TOKEN) return process.env.LOGISMATA_UPSTREAM_TOKEN;
  try {
    const envFile = readFileSync(path.join(import.meta.dirname, "..", "..", ".env.local"), "utf8");
    return envFile.match(/^LOGISMATA_API_TOKEN=(.*)$/m)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

const logismata = load<LogismataRecord[]>("logismata.json", []);
const quicksale = load<QuicksaleFixtures>("quicksale.json", { defaults: null, calls: [] });

/** Leaf values as "path=value", to compare two requests field by field. */
function leaves(value: Json, prefix = "", out = new Set<string>()): Set<string> {
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) leaves(child, `${prefix}.${key}`, out);
  } else out.add(`${prefix}=${JSON.stringify(value)}`);
  return out;
}

function closest<T extends { request: Json }>(candidates: T[], request: Json): T | undefined {
  const wanted = leaves(request);
  const exact = JSON.stringify(request);
  let best: T | undefined;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (JSON.stringify(candidate.request) === exact) return candidate;
    let score = 0;
    for (const leaf of leaves(candidate.request)) if (wanted.has(leaf)) score++;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body: Json) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

// ─── Logismata ──────────────────────────────────────────────────────────────

async function handleLogismata(operation: string, raw: string, res: ServerResponse) {
  const request = JSON.parse(raw) as Json;
  if (RECORD) {
    const upstream = await fetch(`${LOGISMATA_UPSTREAM}/operation/standard/${operation}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstreamToken()}`,
        "Content-Type": "application/json",
      },
      body: raw,
    });
    const response = (await upstream.json().catch(() => null)) as Json;
    const exact = JSON.stringify(request);
    if (!logismata.some((r) => r.operation === operation && JSON.stringify(r.request) === exact)) {
      logismata.push({ operation, request, status: upstream.status, response });
      save("logismata.json", logismata);
    }
    return send(res, upstream.status, response);
  }
  const match = closest(
    logismata.filter((r) => r.operation === operation),
    request,
  );
  if (!match) return send(res, 404, { error: { message: `No fixture for ${operation}` } });
  send(res, match.status, match.response);
}

// ─── Quicksale ──────────────────────────────────────────────────────────────

interface QsAction {
  vorschlag?: {
    sessionId?: string;
    aktion?: { key?: string; parameter?: Array<{ name: string; text?: string }> };
  };
}

const sessions = new Map<string, { product: string; last: Json; upstreamId?: string }>();
let sessionCount = 0;

const pick = (value: unknown, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(
    keys
      .filter((k) => value && typeof value === "object" && k in value)
      .map((k) => [k, (value as Record<string, unknown>)[k]]),
  );

/**
 * A Quicksale proposal is ~60 KB (every person, display and correspondence block); only the
 * fields the app reads (src/lib/pricing/quicksale/types.ts) are stored, like the unit-test
 * fixtures in src/lib/pricing/quicksale/__fixtures__.
 */
function trimProposal(response: Json): Json {
  const r = response as { message?: string; state?: string; data?: Record<string, unknown> };
  if (!r?.data) return response;
  const data = pick(r.data, [
    "sessionId",
    "beginnDatum",
    "ratenPraemie",
    "jahresPraemie",
    "einmalpraemieTotal",
    "erlebensfallleistungTotal",
    "bruttopraemie",
    "aktuelleUeberschuesse",
    "nettopraemie",
    "sparprodukt",
    "warnungen",
    "vorsorgeart",
    "verwendeteAnnahmen",
    "fonds",
  ]);
  const persons = Array.isArray(r.data.personen) ? r.data.personen.slice(0, 1) : [];
  data.personen = persons.map((person) => ({
    ...pick(person, [
      "index",
      "geburtsdatum",
      "selectedGeschlecht",
      "raucher",
      "praemienbefreiung",
      "selectedHauptberufId",
      "technischesAlter",
      "selectedRolle",
    ]),
    tarife: ((person as { tarife?: unknown[] }).tarife ?? []).map((tariff) =>
      pick(tariff, [
        "index",
        "code",
        "selectedTarif",
        "dauer",
        "schlussalter",
        "selectedWartefrist",
        "periodischePraemie",
        "einmalpraemie",
        "risikosumme",
        "erlebensfallleistung",
        "tarifauswahlen",
      ]),
    ),
  }));
  return { message: r.message, state: r.state, data };
}

function withSession(response: Json, sessionId: string): Json {
  const copy = structuredClone(response) as { data?: { sessionId?: string } };
  if (copy?.data && "sessionId" in copy.data) copy.data.sessionId = sessionId;
  return copy;
}

/** The request without its session id, as stored and compared. */
function actionOf(raw: string): {
  sessionId: string;
  key: string;
  request: Json;
  product?: string;
} {
  const body = JSON.parse(raw) as QsAction;
  const { sessionId = "", ...vorschlag } = body.vorschlag ?? {};
  const key = vorschlag.aktion?.key ?? "";
  const product = vorschlag.aktion?.parameter?.find((p) => p.name === "TECHNICAL_NAME")?.text;
  return { sessionId, key, request: { vorschlag }, product };
}

async function handleQuicksale(route: string, method: string, raw: string, res: ServerResponse) {
  if (route === "/api/defaults/vorschlag" && method === "GET") {
    const id = `e2e-session-${++sessionCount}`;
    if (RECORD) {
      const upstream = await fetch(`${QUICKSALE_UPSTREAM}${route}`, {
        headers: { username: "PublicUser", admnr: "0", benutzergruppe: "0", rdnr: "0", sex: "1" },
      });
      const response = (await upstream.json()) as {
        message?: string;
        state?: string;
        data?: { sessionId?: string };
      };
      quicksale.defaults = {
        message: response.message,
        state: response.state,
        data: { sessionId: "e2e-session" },
      };
      save("quicksale.json", quicksale);
      sessions.set(id, { product: "", last: null, upstreamId: response.data?.sessionId });
      return send(res, upstream.status, withSession(response, id));
    }
    if (!quicksale.defaults) return send(res, 404, { message: "No Quicksale fixtures" });
    sessions.set(id, { product: "", last: null });
    return send(res, 200, withSession(quicksale.defaults, id));
  }
  if (route !== "/api/vorschlaege" || method !== "POST") return send(res, 404, {});

  const { sessionId, key, request, product } = actionOf(raw);
  const session = sessions.get(sessionId);
  if (!session) return send(res, 404, { state: "ERROR", message: "Unknown session" });
  if (product) session.product = product;

  let response: Json;
  if (RECORD) {
    const upstreamBody = JSON.parse(raw) as QsAction;
    if (upstreamBody.vorschlag) upstreamBody.vorschlag.sessionId = session.upstreamId;
    const upstream = await fetch(`${QUICKSALE_UPSTREAM}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        username: "PublicUser",
        admnr: "0",
        benutzergruppe: "0",
        rdnr: "0",
        sex: "1",
      },
      body: JSON.stringify(upstreamBody),
    });
    response = await upstream.json();
    const exact = JSON.stringify(request);
    const stored = withSession(trimProposal(response), "e2e-session");
    if (
      !quicksale.calls.some(
        (c) => c.product === session.product && JSON.stringify(c.request) === exact,
      )
    ) {
      quicksale.calls.push({ product: session.product, action: key, request, response: stored });
      save("quicksale.json", quicksale);
    }
  } else {
    const sameProduct = quicksale.calls.filter((c) => c.product === session.product);
    const match = closest(
      sameProduct.filter((c) => c.action === key),
      request,
    );
    // An action never recorded for this product leaves the proposal as it is.
    response = match?.response ?? session.last;
    if (!response) return send(res, 404, { state: "ERROR", message: `No fixture for ${key}` });
  }
  session.last = response;
  send(res, 200, withSession(response, sessionId));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    const raw = req.method === "POST" ? await readBody(req) : "";
    const logismataOp = url.pathname.match(/^\/logismata\/operation\/standard\/(\w+)$/)?.[1];
    if (logismataOp && req.method === "POST") return await handleLogismata(logismataOp, raw, res);
    if (url.pathname.startsWith("/quicksale/"))
      return await handleQuicksale(
        url.pathname.slice("/quicksale".length),
        req.method ?? "GET",
        raw,
        res,
      );
    send(res, 404, { error: { message: `Unknown route ${url.pathname}` } });
  } catch (error) {
    console.error("[e2e fixtures] request failed", error);
    send(res, 500, { error: { message: String(error) } });
  }
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`[e2e] fixture server on :${PORT}${RECORD ? " (recording)" : ""}`),
);
