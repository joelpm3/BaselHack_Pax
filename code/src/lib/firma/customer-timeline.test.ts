import { describe, expect, it } from "vitest";
import {
  buildCommunications,
  buildTimeline,
  isEmailAudit,
  type TimelineInput,
} from "./customer-timeline";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 10, minute));

const empty: TimelineInput = {
  conversations: [],
  handovers: [],
  leads: [],
  activities: [],
  recommendations: [],
  applications: [],
  policies: [],
  documents: [],
  feedback: [],
  audit: [],
};

describe("isEmailAudit", () => {
  it("accepts the email action family and data.type email", () => {
    expect(isEmailAudit({ action: "email", data: null })).toBe(true);
    expect(isEmailAudit({ action: "email.sent", data: null })).toBe(true);
    expect(isEmailAudit({ action: "followup.sent", data: { type: "email" } })).toBe(true);
    expect(isEmailAudit({ action: "emailing.x", data: null })).toBe(false);
    expect(isEmailAudit({ action: "lead.created", data: null })).toBe(false);
  });
});

describe("buildCommunications", () => {
  it("merges email/call activities and email audit entries, newest first", () => {
    const result = buildCommunications({
      activities: [
        {
          id: "a1",
          leadId: "l1",
          type: "call",
          body: "Rückruf vereinbart",
          data: null,
          createdAt: at(1),
          advisorName: "Anna",
        },
        {
          id: "a2",
          leadId: "l1",
          type: "note",
          body: "intern",
          data: null,
          createdAt: at(2),
          advisorName: "Anna",
        },
      ],
      audit: [
        {
          id: "e1",
          action: "email.sent",
          actorName: null,
          entityId: "c1",
          data: { subject: "Ihre Offerte", to: "x@example.ch", direction: "outbound" },
          createdAt: at(3),
        },
      ],
    });
    expect(result.map((m) => m.id)).toEqual(["e1", "a1"]);
    expect(result[0]).toMatchObject({
      channel: "email",
      subject: "Ihre Offerte",
      to: "x@example.ch",
      direction: "outbound",
    });
    expect(result[1]).toMatchObject({ channel: "call", body: "Rückruf vereinbart", actor: "Anna" });
  });
});

describe("buildTimeline", () => {
  it("tells every step once, across conversations, newest first", () => {
    const timeline = buildTimeline({
      ...empty,
      conversations: [
        { id: "c1", title: "Erstes", createdAt: at(0) },
        { id: "c2", title: "Zweites", createdAt: at(10) },
      ],
      handovers: [{ id: "h1", conversationId: "c2", reason: "Will Person", createdAt: at(12) }],
      leads: [
        { id: "l1", conversationId: "c1", type: "new_business", score: 80, createdAt: at(5) },
      ],
      activities: [
        {
          id: "a1",
          leadId: "l1",
          type: "status_change",
          body: null,
          data: { from: "new", to: "contacted" },
          createdAt: at(20),
          advisorName: "Anna",
        },
        {
          id: "a2",
          leadId: "l1",
          type: "system",
          body: null,
          data: { event: "created", score: 80 },
          createdAt: at(5),
          advisorName: null,
        },
      ],
      audit: [
        // Duplicates of rows above: skipped.
        {
          id: "x1",
          action: "lead.created",
          actorName: null,
          entityId: "l1",
          data: null,
          createdAt: at(5),
        },
        {
          id: "x2",
          action: "lead.status_changed",
          actorName: "Anna",
          entityId: "l1",
          data: null,
          createdAt: at(20),
        },
        {
          id: "x3",
          action: "handover.updated",
          actorName: "Ben",
          entityId: "h1",
          data: { from: { status: "open" }, to: { status: "done" } },
          createdAt: at(25),
        },
        {
          id: "x4",
          action: "handover.updated",
          actorName: "Ben",
          entityId: "h1",
          data: { to: { assignedAdvisorId: "b" } },
          createdAt: at(24),
        },
        {
          id: "x5",
          action: "email.sent",
          actorName: null,
          entityId: "c2",
          data: { subject: "Termin" },
          createdAt: at(30),
        },
        {
          id: "x6",
          action: "something.new",
          actorName: null,
          entityId: "c2",
          data: null,
          createdAt: at(26),
        },
      ],
    });
    expect(timeline.map((e) => e.event)).toEqual([
      "email",
      "other",
      "handoverStatus",
      "handoverAssigned",
      "leadStatus",
      "handoverCreated",
      "conversationStarted",
      "leadCreated",
      "conversationStarted",
    ]);
    const status = timeline.find((e) => e.event === "leadStatus");
    expect(status).toMatchObject({
      params: { from: "new", to: "contacted" },
      conversationId: "c1",
      actor: "Anna",
    });
    expect(timeline.find((e) => e.event === "handoverStatus")?.params).toEqual({ status: "done" });
    expect(timeline[0]).toMatchObject({ kind: "communication", text: "Termin" });
  });

  it("only shows signed applications and non-seeded policies", () => {
    const timeline = buildTimeline({
      ...empty,
      applications: [
        {
          id: "ap1",
          conversationId: "c1",
          productCode: "x",
          status: "draft",
          signedAt: null,
        },
        {
          id: "ap2",
          conversationId: "c1",
          productCode: "y",
          status: "signed",
          signedAt: at(3),
        },
      ],
      policies: [
        { id: "p1", productName: "Alt", source: "seed", createdAt: at(1) },
        { id: "p2", productName: "Neu", source: "chat", createdAt: at(4) },
      ],
    });
    expect(timeline.map((e) => e.id)).toEqual(["policy-p2", "application-ap2"]);
  });
});
