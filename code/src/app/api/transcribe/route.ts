import {
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
  type TranscribeErrorCode,
  type TranscribeResponse,
} from "@/components/voice/types";
import { env } from "@/env";
import { getCurrentCustomer } from "@/lib/auth/customer";

/**
 * Proxy to the team's Swiss-German Nemotron server (OpenAI-style /v1/audio/transcriptions on a
 * Nebius GPU). The browser never talks to it directly: the server has no auth and no CORS.
 * Audio is forwarded and discarded, never stored. The server decodes one request at a time, so
 * requests are queued here and refused when the queue is full.
 */

const MAX_BYTES = 8 * 1024 * 1024; // 60 s of WAV is ~2 MB, webm/opus ~0.5 MB
const UPSTREAM_TIMEOUT_MS = 45_000;
const MAX_QUEUE = 4;
const ACCEPTED = /^(audio|video)\/(webm|ogg|mp4|mpeg|x-m4a|m4a|aac|wav|x-wav|wave)$/;
const EXTENSIONS: Record<string, string> = { webm: "webm", ogg: "ogg", mp4: "m4a", wav: "wav" };

interface Queue {
  running: boolean;
  waiting: Array<() => void>;
}
const globalForStt = globalThis as unknown as { paxSttQueue?: Queue };
const queue: Queue = globalForStt.paxSttQueue ?? { running: false, waiting: [] };
globalForStt.paxSttQueue = queue;

function fail(status: number, error: TranscribeErrorCode): Response {
  return Response.json({ error } satisfies TranscribeResponse, { status });
}

async function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  if (queue.running) await new Promise<void>((resolve) => queue.waiting.push(resolve));
  queue.running = true;
  try {
    return await fn();
  } finally {
    const next = queue.waiting.shift();
    if (next) next();
    else queue.running = false;
  }
}

async function forward(file: Blob): Promise<Response> {
  const type = file.type.split(";")[0];
  const extension = EXTENSIONS[type.split("/")[1]] ?? "webm";
  const body = new FormData();
  body.append("file", file, `speech.${extension}`);
  body.append("response_format", "json");

  let upstream: Response;
  try {
    upstream = await fetch(`${env.STT_BASE_URL}/v1/audio/transcriptions`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return fail(503, "unavailable");
  }
  if (upstream.status === 503) return fail(503, "starting");
  if (upstream.status === 400) return fail(422, "unreadable");
  if (!upstream.ok) return fail(502, "failed");
  const payload = (await upstream.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof payload?.text !== "string") return fail(502, "failed");
  return Response.json({ text: payload.text.trim() } satisfies TranscribeResponse);
}

export async function POST(request: Request): Promise<Response> {
  const customer = await getCurrentCustomer();
  if (!customer) return fail(401, "unauthorized");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 64 * 1024) return fail(413, "too_large");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "invalid");
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return fail(400, "empty");
  if (file.size > MAX_BYTES) return fail(413, "too_large");
  const type = file.type.split(";")[0];
  if (type && !ACCEPTED.test(type)) return fail(415, "unsupported");

  const durationMs = Number(form.get("durationMs"));
  if (Number.isFinite(durationMs) && durationMs > 0) {
    // Small allowance for the recorder stopping slightly after the 60 s limit.
    if (durationMs > MAX_RECORDING_MS + 5_000) return fail(413, "too_long");
    if (durationMs < MIN_RECORDING_MS) return fail(400, "too_short");
  }

  if (queue.running && queue.waiting.length >= MAX_QUEUE) return fail(429, "busy");
  return oneAtATime(() => forward(file));
}
