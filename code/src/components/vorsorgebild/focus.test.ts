import { describe, expect, it } from "vitest";
import { type FocusEvent, focusReducer, initialFocus, type PictureFocus } from "./focus";

const run = (state: PictureFocus, ...events: FocusEvent[]) => events.reduce(focusReducer, state);

describe("focusReducer", () => {
  it("follows Clara's new message", () => {
    const state = run(initialFocus(null), { type: "send" }, { type: "advisor", kind: "death" });
    expect(state).toMatchObject({ kind: "death", byAdvisor: true, seq: 1 });
  });

  it("keeps the situation when Clara's message names none, but drops the cue", () => {
    const state = run(
      initialFocus("disability"),
      { type: "send" },
      { type: "advisor", kind: null },
    );
    expect(state).toMatchObject({ kind: "disability", byAdvisor: false, seq: 0 });
  });

  it("keeps the customer's pick until their next message", () => {
    const picked = run(initialFocus("death"), { type: "pick", kind: "retirement" });
    expect(picked).toMatchObject({ kind: "retirement", byAdvisor: false });
    const next = run(picked, { type: "send" }, { type: "advisor", kind: "death" });
    expect(next).toMatchObject({ kind: "death", byAdvisor: true });
  });

  it("does not override a pick made while Clara was answering", () => {
    const state = run(
      initialFocus("retirement"),
      { type: "send" },
      { type: "pick", kind: "retirement" },
      { type: "advisor", kind: "disability" },
    );
    expect(state).toMatchObject({ kind: "retirement", byAdvisor: false });
  });

  it("returns the same state when nothing changes, so nothing re-renders", () => {
    const state = initialFocus(null);
    expect(focusReducer(state, { type: "send" })).toBe(state);
    expect(focusReducer(state, { type: "advisor", kind: null })).toBe(state);
  });

  it("counts every switch so the cue replays for the same situation", () => {
    const state = run(
      initialFocus(null),
      { type: "advisor", kind: "death" },
      { type: "send" },
      { type: "advisor", kind: "death" },
    );
    expect(state.seq).toBe(2);
  });
});
