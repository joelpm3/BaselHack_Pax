import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { replacedFacts } from "./profile-diff";

describe("replacedFacts", () => {
  const current = lifeSituationSchema.parse({
    person: { birthYear: 1996, sex: "male" },
    partner: { birthYear: 1990 },
    children: [{ birthYear: 2020 }],
  });

  it("reports facts that get a different value", () => {
    expect(
      replacedFacts(
        [
          { path: "person.birthYear", value: 1990 },
          { path: "partner.birthYear", value: 1996 },
        ],
        current,
      ),
    ).toEqual([
      { path: "person.birthYear", previous: 1996, value: 1990 },
      { path: "partner.birthYear", previous: 1990, value: 1996 },
    ]);
  });

  it("ignores new facts, unchanged values and lists", () => {
    expect(
      replacedFacts(
        [
          { path: "person.sex", value: "male" },
          { path: "person.grossIncome", value: 90000 },
          { path: "children", value: [] },
        ],
        current,
      ),
    ).toEqual([]);
  });
});
