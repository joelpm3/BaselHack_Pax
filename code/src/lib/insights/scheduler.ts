/**
 * Debounced, de-duplicated background runner keyed by id (one key per conversation):
 * - `schedule(key)` (re)starts a quiet-period timer; bursts of turns collapse into one run.
 * - A key never runs twice at once: a schedule during a run marks it dirty and it runs again
 *   (debounced) after the current run finishes.
 * - At most `maxConcurrent` runs overall; ready keys wait in a FIFO queue.
 */
export interface KeyedDebouncerOptions {
  delayMs: number;
  maxConcurrent: number;
  run: (key: string) => Promise<void>;
  onError?: (key: string, error: unknown) => void;
}

export interface KeyedDebouncer {
  schedule: (key: string) => void;
  /** Debouncing, queued or running. */
  isPending: (key: string) => boolean;
  stats: () => { waiting: number; queued: number; running: number };
}

export function createKeyedDebouncer(options: KeyedDebouncerOptions): KeyedDebouncer {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const queue: string[] = [];
  const running = new Set<string>();
  const dirty = new Set<string>();

  function pump(): void {
    while (running.size < options.maxConcurrent && queue.length > 0) {
      const key = queue.shift() as string;
      void start(key);
    }
  }

  async function start(key: string): Promise<void> {
    running.add(key);
    try {
      await options.run(key);
    } catch (error) {
      options.onError?.(key, error);
    } finally {
      running.delete(key);
      if (dirty.delete(key)) schedule(key);
      pump();
    }
  }

  function schedule(key: string): void {
    if (running.has(key)) {
      dirty.add(key);
      return;
    }
    // Already waiting for a free slot: that run will see the newest data anyway.
    if (queue.includes(key)) return;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        queue.push(key);
        pump();
      }, options.delayMs),
    );
  }

  return {
    schedule,
    isPending: (key) => timers.has(key) || queue.includes(key) || running.has(key),
    stats: () => ({ waiting: timers.size, queued: queue.length, running: running.size }),
  };
}
