import { describe, expect, it } from "vitest";
import { type EventState, isCheckinDue, nextCheckinDate, planEvent } from "./plan";

const event = (overrides: Partial<EventState> = {}): EventState => ({
  status: "upcoming",
  expectedDate: "2028-10-01",
  emails: [],
  cameBack: false,
  ...overrides,
});

describe("planEvent", () => {
  it("opens the Wiedervorlage a week before the expected date", () => {
    expect(planEvent(event(), "2028-09-23")).toBeNull();
    expect(planEvent(event(), "2028-09-24")).toEqual({ type: "open" });
    expect(planEvent(event(), "2029-03-01")).toEqual({ type: "open" });
  });

  it("respects a configured lead time", () => {
    const config = { leadDays: 30, reminderDays: 14, maxEmails: 2 };
    expect(planEvent(event(), "2028-09-01", config)).toEqual({ type: "open" });
  });

  it("sends the reminder after two quiet weeks, then marks the lead lost", () => {
    const first = { sequence: 1, sentOn: "2028-09-24", replied: false };
    const due = event({ status: "due", emails: [first] });
    expect(planEvent(due, "2028-10-07")).toBeNull();
    expect(planEvent(due, "2028-10-08")).toEqual({ type: "remind", sequence: 2 });

    const second = { sequence: 2, sentOn: "2028-10-08", replied: false };
    const reminded = event({ status: "due", emails: [second, first] });
    expect(planEvent(reminded, "2028-10-15")).toBeNull();
    expect(planEvent(reminded, "2028-10-22")).toEqual({ type: "lose" });
  });

  it("stops when the customer replies or comes back", () => {
    const replied = event({
      status: "due",
      emails: [{ sequence: 1, sentOn: "2028-09-24", replied: true }],
    });
    expect(planEvent(replied, "2028-12-01")).toEqual({ type: "respond", reopen: false });
    const back = event({
      status: "due",
      emails: [{ sequence: 1, sentOn: "2028-09-24", replied: false }],
      cameBack: true,
    });
    expect(planEvent(back, "2028-09-25")).toEqual({ type: "respond", reopen: false });
  });

  it("stops emailing once an advisor moved the lead on", () => {
    const due = event({
      status: "due",
      emails: [{ sequence: 1, sentOn: "2028-09-24", replied: false }],
      leadInProgress: true,
    });
    expect(planEvent(due, "2028-12-01")).toEqual({ type: "respond", reopen: false });
  });

  it("reopens a lost lead when the customer reacts later", () => {
    const emails = [
      { sequence: 1, sentOn: "2028-09-24", replied: false },
      { sequence: 2, sentOn: "2028-10-08", replied: false },
    ];
    expect(planEvent(event({ status: "lost", emails }), "2029-01-01")).toBeNull();
    expect(planEvent(event({ status: "lost", emails, cameBack: true }), "2029-01-01")).toEqual({
      type: "respond",
      reopen: true,
    });
  });

  it("leaves finished events alone", () => {
    expect(planEvent(event({ status: "responded" }), "2030-01-01")).toBeNull();
    expect(planEvent(event({ status: "dismissed" }), "2030-01-01")).toBeNull();
  });
});

describe("yearly check-in", () => {
  const base = { enabled: true, hasEmail: true, lastSentOn: null, since: "2026-10-31" };

  it("is due a year after the start, then a year after the last one", () => {
    expect(nextCheckinDate(base)).toBe("2027-10-31");
    expect(isCheckinDue(base, "2027-10-30")).toBe(false);
    expect(isCheckinDue(base, "2027-10-31")).toBe(true);
    expect(isCheckinDue({ ...base, lastSentOn: "2027-10-31" }, "2028-06-01")).toBe(false);
    expect(isCheckinDue({ ...base, lastSentOn: "2027-10-31" }, "2028-10-31")).toBe(true);
  });

  it("never goes to customers who opted out or have no email address", () => {
    expect(isCheckinDue({ ...base, enabled: false }, "2030-01-01")).toBe(false);
    expect(isCheckinDue({ ...base, hasEmail: false }, "2030-01-01")).toBe(false);
  });
});
