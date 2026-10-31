import { describe, expect, it } from "vitest";
import { type DocumentOutcome, describeDocumentOutcome } from "./outcome";

const confirmed: DocumentOutcome = {
  documentId: "d1",
  docType: "pension_certificate",
  status: "confirmed",
  confirmed: true,
  subject: "partner",
  applied: [
    { path: "partner.pillar2.disabilityPension", value: 29416 },
    { path: "partner.pillar2.hasPensionFund", value: true },
  ],
  inCockpit: true,
};

describe("describeDocumentOutcome", () => {
  it("tells the advisor which values are already in the profile", () => {
    const note = describeDocumentOutcome(confirmed);
    expect(note).toContain("pension_certificate, the partner's");
    expect(note).toContain("already applied to the profile (source: document)");
    expect(note).toContain("partner.pillar2.disabilityPension = 29416");
    expect(note).toContain("Do not store these values again with updateProfile");
  });

  it("says so when the document only confirmed what was known", () => {
    expect(describeDocumentOutcome({ ...confirmed, applied: [], inCockpit: false })).toContain(
      "already matched the profile",
    );
  });

  it("marks discarded and unconfirmed documents as unused", () => {
    expect(
      describeDocumentOutcome({ ...confirmed, status: "deleted", confirmed: false }),
    ).toContain("discarded");
    expect(
      describeDocumentOutcome({ ...confirmed, status: "extracted", confirmed: false, applied: [] }),
    ).toContain("not confirmed");
  });
});
