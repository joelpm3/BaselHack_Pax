import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyedDebouncer } from "./scheduler";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createKeyedDebouncer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses a burst of schedules into one run after the quiet period", async () => {
    const run = vi.fn(async () => {});
    const d = createKeyedDebouncer({ delayMs: 3000, maxConcurrent: 2, run });
    d.schedule("a");
    await vi.advanceTimersByTimeAsync(2000);
    d.schedule("a");
    await vi.advanceTimersByTimeAsync(2000);
    d.schedule("a");
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("a");
  });

  it("never runs one key twice at once and reruns once when scheduled during a run", async () => {
    const gates = [deferred(), deferred()];
    let active = 0;
    let maxActive = 0;
    let call = 0;
    const run = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gates[call++].promise;
      active--;
    });
    const d = createKeyedDebouncer({ delayMs: 100, maxConcurrent: 4, run });
    d.schedule("a");
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);

    d.schedule("a");
    d.schedule("a");
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);

    gates[0].resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
    gates[1].resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
    expect(d.isPending("a")).toBe(false);
  });

  it("caps concurrency across keys and drains the queue in order", async () => {
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const started: string[] = [];
    const run = vi.fn(async (key: string) => {
      started.push(key);
      const gate = deferred();
      gates.set(key, gate);
      await gate.promise;
    });
    const d = createKeyedDebouncer({ delayMs: 10, maxConcurrent: 2, run });
    for (const key of ["a", "b", "c", "d"]) d.schedule(key);
    await vi.advanceTimersByTimeAsync(10);
    expect(started).toEqual(["a", "b"]);
    expect(d.stats()).toEqual({ waiting: 0, queued: 2, running: 2 });

    gates.get("a")?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["a", "b", "c"]);
    gates.get("b")?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps going after a failed run and reports the error", async () => {
    const onError = vi.fn();
    const run = vi.fn(async (key: string) => {
      if (key === "bad") throw new Error("boom");
    });
    const d = createKeyedDebouncer({ delayMs: 10, maxConcurrent: 1, run, onError });
    d.schedule("bad");
    d.schedule("good");
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith("bad", expect.any(Error));
    expect(run).toHaveBeenCalledWith("good");
  });
});
