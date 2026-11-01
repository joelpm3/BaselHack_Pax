import { describe, expect, it } from "vitest";
import type { FieldDef } from "./fields";
import { normalizeExtractedFields, normalizeValue, parseDate, parseSwissNumber } from "./normalize";

const field = (kind: FieldDef["kind"], extra: Partial<FieldDef> = {}): FieldDef => ({
  key: "x",
  kind,
  group: "g",
  describe: "",
  ...extra,
});

describe("parseSwissNumber", () => {
  it("reads amounts as they are printed on Swiss certificates", () => {
    expect(parseSwissNumber("CHF 73'540.–")).toBe(73540);
    expect(parseSwissNumber("Fr. 1’234.50")).toBe(1234.5);
    expect(parseSwissNumber("12 500.-")).toBe(12500);
    expect(parseSwissNumber("85'000.—")).toBe(85000);
    expect(parseSwissNumber("6,8 %")).toBe(6.8);
    expect(parseSwissNumber("1,234,567")).toBe(1234567);
    expect(parseSwissNumber("-250")).toBe(-250);
  });

  it("rejects text that is not a single number", () => {
    expect(parseSwissNumber("ca. 5000")).toBeNull();
    expect(parseSwissNumber("5000 / 6000")).toBeNull();
    expect(parseSwissNumber("")).toBeNull();
    expect(parseSwissNumber(Number.NaN)).toBeNull();
    expect(parseSwissNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseSwissNumber(null)).toBeNull();
    expect(parseSwissNumber({ value: 1 })).toBeNull();
  });
});

describe("parseDate", () => {
  it("accepts ISO and Swiss dates and returns ISO", () => {
    expect(parseDate("2026-01-31")).toBe("2026-01-31");
    expect(parseDate("16.09.1984")).toBe("1984-09-16");
    expect(parseDate(" 1.2.2027 ")).toBe("2027-02-01");
  });

  it("rejects dates that do not exist instead of rolling them over", () => {
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("29.02.2027")).toBeNull();
    expect(parseDate("29.02.2028")).toBe("2028-02-29");
  });

  it("rejects implausible years and other formats", () => {
    expect(parseDate("01.01.1899")).toBeNull();
    expect(parseDate("01.01.2121")).toBeNull();
    expect(parseDate("09/16/1984")).toBeNull();
    expect(parseDate("16.09.84")).toBeNull();
    expect(parseDate(19840916)).toBeNull();
  });
});

describe("normalizeValue", () => {
  it("keeps CHF amounts non-negative, below a billion and to the centime", () => {
    const chf = field("chf");
    expect(normalizeValue(chf, "CHF 1'234.567")).toBe(1234.57);
    expect(normalizeValue(chf, -10)).toBeNull();
    expect(normalizeValue(chf, 1e9)).toBeNull();
    expect(normalizeValue(chf, "")).toBeNull();
  });

  it("reads fractions as percent and rejects values above 100", () => {
    const percent = field("percent");
    expect(normalizeValue(percent, "90 %")).toBe(90);
    expect(normalizeValue(percent, 0.8)).toBe(80);
    expect(normalizeValue(percent, "6,85")).toBe(6.9);
    expect(normalizeValue(percent, 0)).toBe(0);
    expect(normalizeValue(percent, 120)).toBeNull();
  });

  it("accepts whole numbers in range only", () => {
    const integer = field("integer");
    expect(normalizeValue(integer, "12")).toBe(12);
    expect(normalizeValue(integer, 2.5)).toBeNull();
    expect(normalizeValue(integer, 3001)).toBeNull();
  });

  it("collapses whitespace in text and caps it at 200 characters", () => {
    const text = field("text");
    expect(normalizeValue(text, "  Pax \n Schweizerische   Lebensversicherung ")).toBe(
      "Pax Schweizerische Lebensversicherung",
    );
    expect(normalizeValue(text, 4051)).toBe("4051");
    expect(normalizeValue(text, "   ")).toBeNull();
    expect(normalizeValue(text, "a".repeat(250))).toHaveLength(200);
  });

  it("accepts only listed enum options and real booleans", () => {
    const frequency = field("enum", { options: ["monthly", "yearly"] });
    expect(normalizeValue(frequency, "yearly")).toBe("yearly");
    expect(normalizeValue(frequency, "Yearly")).toBeNull();
    const flag = field("boolean");
    expect(normalizeValue(flag, "true")).toBe(true);
    expect(normalizeValue(flag, false)).toBe(false);
    expect(normalizeValue(flag, "ja")).toBeNull();
    expect(normalizeValue(flag, 1)).toBeNull();
  });
});

describe("normalizeExtractedFields", () => {
  const defs = [
    field("chf", { key: "grossSalary" }),
    field("date", { key: "birthDate" }),
    field("percent", { key: "workloadPercent" }),
  ];

  it("keeps only usable fields, in definition order, with clamped metadata", () => {
    const fields = normalizeExtractedFields(defs, {
      workloadPercent: { value: "n/a", confidence: 0.9 },
      birthDate: { value: "16.09.1984", confidence: 1.4, page: 2.6, quote: "  geb. 16.09.1984 " },
      grossSalary: { value: "CHF 85'000.–", confidence: "high", page: 0, quote: "   " },
      unknownKey: { value: 1 },
    });
    expect(fields).toEqual([
      { path: "grossSalary", value: 85000, confidence: 0.5, page: null, quote: null },
      { path: "birthDate", value: "1984-09-16", confidence: 1, page: 3, quote: "geb. 16.09.1984" },
    ]);
  });

  it("skips fields the model left out or set to null", () => {
    expect(normalizeExtractedFields(defs, { grossSalary: null, birthDate: undefined })).toEqual([]);
  });
});
