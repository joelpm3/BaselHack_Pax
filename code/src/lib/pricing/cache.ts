import "server-only";
import type { Quote } from "./types";

/**
 * In-memory cache for live quotes (keyed by the normalized input) plus in-flight de-duplication,
 * so repeated recommendations and offers never re-query Quicksale. Survives dev hot reloads.
 */
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

interface CacheState {
  entries: Map<string, { quote: Quote; expires: number }>;
  inFlight: Map<string, Promise<unknown>>;
}
const globalForCache = globalThis as unknown as { paxQuoteCache?: CacheState };
const cache: CacheState = globalForCache.paxQuoteCache ?? {
  entries: new Map(),
  inFlight: new Map(),
};
globalForCache.paxQuoteCache = cache;

export function getCachedQuote(key: string): Quote | undefined {
  const hit = cache.entries.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.entries.delete(key);
    return undefined;
  }
  return hit.quote;
}

export function setCachedQuote(key: string, quote: Quote): void {
  if (cache.entries.size >= MAX_ENTRIES) {
    const oldest = cache.entries.keys().next().value;
    if (oldest !== undefined) cache.entries.delete(oldest);
  }
  cache.entries.set(key, { quote, expires: Date.now() + TTL_MS });
}

/** Runs `fn` once per key at a time; concurrent callers share the same promise. */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = cache.inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = fn().finally(() => cache.inFlight.delete(key));
  cache.inFlight.set(key, promise);
  return promise;
}
