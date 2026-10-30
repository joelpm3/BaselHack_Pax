import { describe, expect, it } from "vitest";
import { EDITABLE_FIELDS, parseFieldValue } from "./profile-fields";

describe("parseFieldValue", () => {
  it("reads Swiss number notation", () => {
    expect(parseFieldValue(EDITABLE_FIELDS["person.grossIncome"], "95'000")).toBe(95000);
    expect(parseFieldValue(EDITABLE_FIELDS["person.grossIncome"], "95 000")).toBe(95000);
    expect(parseFieldValue(EDITABLE_FIELDS["person.workloadPercent"], "80,5")).toBe(81);
  });

  it("rejects invalid values and clears empty ones", () => {
    expect(parseFieldValue(EDITABLE_FIELDS["person.birthYear"], "abc")).toBeUndefined();
    expect(parseFieldValue(EDITABLE_FIELDS["person.grossIncome"], "-5")).toBeUndefined();
    expect(parseFieldValue(EDITABLE_FIELDS["person.birthYear"], " ")).toBeNull();
  });

  it("accepts only known enum values and booleans", () => {
    expect(parseFieldValue(EDITABLE_FIELDS["person.maritalStatus"], "married")).toBe("married");
    expect(parseFieldValue(EDITABLE_FIELDS["person.maritalStatus"], "engaged")).toBeUndefined();
    expect(parseFieldValue(EDITABLE_FIELDS["pillar2.hasPensionFund"], "false")).toBe(false);
  });
});
