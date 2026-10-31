import { describe, expect, it } from "vitest";
import type { ExtractedField } from "@/lib/db/schema";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { DOCUMENT_FIELDS } from "./fields";
import {
  annualPremium,
  applyEdits,
  firstNameOf,
  noticeDeadline,
  policyDraftFor,
  profileChangesFor,
  suggestSubject,
} from "./mapping";
import { normalizeExtractedFields, normalizeValue, parseDate, parseSwissNumber } from "./normalize";

const field = (path: string, value: unknown, confidence = 0.95): ExtractedField => ({
  path,
  value,
  confidence,
  page: 1,
  quote: null,
});

const emptyProfile = lifeSituationSchema.parse({});
const mueller = lifeSituationSchema.parse({
  person: { firstName: "Jane", birthYear: 1986, employment: "homemaker" },
  partner: { firstName: "May", birthYear: 1984 },
  children: [{ birthYear: 2026 }],
});

describe("normalisation", () => {
  it("parses Swiss number formats", () => {
    expect(parseSwissNumber("CHF 73'540.–")).toBe(73540);
    expect(parseSwissNumber("1’320.50")).toBe(1320.5);
    expect(parseSwissNumber("2 640,00")).toBe(2640);
    expect(parseSwissNumber("Fr. 100'000.-")).toBe(100000);
    expect(parseSwissNumber("about 5")).toBeNull();
  });

  it("parses ISO and Swiss dates and rejects impossible ones", () => {
    expect(parseDate("16.09.1984")).toBe("1984-09-16");
    expect(parseDate("2049-04-30")).toBe("2049-04-30");
    expect(parseDate("31.02.2027")).toBeNull();
  });

  it("normalises per field kind", () => {
    const defs = DOCUMENT_FIELDS.pension_certificate;
    const workload = defs.find((d) => d.key === "workloadPercent");
    if (!workload) throw new Error("missing def");
    expect(normalizeValue(workload, 0.9)).toBe(90);
    expect(normalizeValue(workload, "100%")).toBe(100);
    const fields = normalizeExtractedFields(defs, {
      insuredSalary: {
        value: "73'540",
        confidence: 1.4,
        page: 1,
        quote: "Versicherter Lohn 73'540",
      },
      maxBuyIn: { value: null, confidence: 0.2, page: null, quote: null },
      birthDate: { value: "16.09.1984", confidence: 0.9, page: 0, quote: "" },
    });
    expect(fields).toEqual([
      { path: "birthDate", value: "1984-09-16", confidence: 0.9, page: null, quote: null },
      {
        path: "insuredSalary",
        value: 73540,
        confidence: 1,
        page: 1,
        quote: "Versicherter Lohn 73'540",
      },
    ]);
  });
});

describe("applyEdits", () => {
  it("overrides, removes and validates edits", () => {
    const { values, invalid } = applyEdits(
      "pension_certificate",
      [field("insuredSalary", 73540), field("maxBuyIn", 86350), field("description", "x")],
      { insuredSalary: "75'000", maxBuyIn: "", birthDate: "not a date", unknownField: 1 },
    );
    expect(values).toEqual({ insuredSalary: 75000 });
    expect(invalid).toEqual(["birthDate", "unknownField"]);
  });
});

describe("profileChangesFor", () => {
  const certificate = {
    insuredPerson: "Herr May Müller",
    birthDate: "1984-09-16",
    grossSalary: 100000,
    workloadPercent: 100,
    insuredSalary: 73540,
    maxBuyIn: 86350,
    disabilityPension: 29420,
  };

  it("maps a pension certificate onto the customer's own profile", () => {
    const changes = profileChangesFor("pension_certificate", certificate, "self", emptyProfile);
    expect(changes).toEqual(
      expect.arrayContaining([
        { path: "person.grossIncome", value: 100000 },
        { path: "person.workloadPercent", value: 100 },
        { path: "person.birthYear", value: 1984 },
        { path: "pillar2.insuredSalary", value: 73540 },
        { path: "pillar2.maxBuyIn", value: 86350 },
        { path: "pillar2.disabilityPension", value: 29420 },
        { path: "pillar2.hasPensionFund", value: true },
        { path: "person.employment", value: "employed" },
        { path: "person.firstName", value: "May" },
      ]),
    );
  });

  it("maps a partner's certificate to the partner and their pension fund only", () => {
    const changes = profileChangesFor("pension_certificate", certificate, "partner", mueller);
    expect(changes).toEqual([
      { path: "partner.grossIncome", value: 100000 },
      { path: "partner.workloadPercent", value: 100 },
      { path: "partner.birthYear", value: 1984 },
      { path: "partner.pillar2.insuredSalary", value: 73540 },
      { path: "partner.pillar2.disabilityPension", value: 29420 },
      { path: "partner.pillar2.maxBuyIn", value: 86350 },
      { path: "partner.pillar2.hasPensionFund", value: true },
      { path: "partner.employment", value: "employed" },
    ]);
    expect(changes.some((c) => c.path.startsWith("pillar2."))).toBe(false);
    // The paths are valid against the profile schema.
    const next = lifeSituationSchema.parse({
      ...mueller,
      partner: {
        ...mueller.partner,
        pillar2: { insuredSalary: 73540, disabilityPension: 29420, hasPensionFund: true },
      },
    });
    expect(next.partner?.pillar2?.disabilityPension).toBe(29420);
    expect(next.pillar2).toEqual({});
  });

  it("maps the gross salary from a salary certificate", () => {
    const changes = profileChangesFor(
      "salary_certificate",
      { grossSalary: 100000, employeeName: "May Müller" },
      "self",
      mueller,
    );
    expect(changes).toEqual([{ path: "person.grossIncome", value: 100000 }]);
  });

  it("never changes the profile for an insurance policy", () => {
    expect(profileChangesFor("insurance_policy", { sumInsured: 1 }, "self", emptyProfile)).toEqual(
      [],
    );
  });
});

describe("suggestSubject", () => {
  it("detects the partner's document by name or birth year", () => {
    expect(suggestSubject({ insuredPerson: "May Müller" }, mueller)).toBe("partner");
    expect(suggestSubject({ birthDate: "1984-09-16" }, mueller)).toBe("partner");
    expect(suggestSubject({ insuredPerson: "Jane Müller" }, mueller)).toBe("self");
    expect(suggestSubject({ insuredPerson: "May Müller" }, emptyProfile)).toBe("self");
  });

  it("extracts first names", () => {
    expect(firstNameOf("Herr May Müller")).toBe("May");
    expect(firstNameOf("Müller, May")).toBe("May");
    expect(firstNameOf("Mme Léa Dubois")).toBe("Léa");
  });
});

describe("policies", () => {
  it("converts premiums to annual amounts", () => {
    expect(annualPremium(1320, "semiannual")).toBe(2640);
    expect(annualPremium(220, "monthly")).toBe(2640);
    expect(annualPremium(500, undefined)).toBe(500);
    expect(annualPremium(50000, "single")).toBeNull();
  });

  it("computes the next notice deadline for yearly cancellation", () => {
    const terms = {
      startDate: "2017-05-01",
      endDate: "2049-04-30",
      noticePeriodMonths: 3,
      annualCancellation: true,
    };
    expect(noticeDeadline(terms, "2026-10-30")).toBe("2027-01-31");
    expect(noticeDeadline(terms, "2027-02-01")).toBe("2028-01-31");
  });

  it("computes the notice deadline before expiry", () => {
    expect(noticeDeadline({ endDate: "2027-12-31", noticePeriodMonths: 3 }, "2026-10-30")).toBe(
      "2027-09-30",
    );
    expect(
      noticeDeadline({ endDate: "2026-12-31", noticePeriodMonths: 3 }, "2026-10-30"),
    ).toBeNull();
    expect(noticeDeadline({ endDate: "2027-12-31" }, "2026-10-30")).toBeNull();
  });

  it("builds an external policy from a policy document", () => {
    const draft = policyDraftFor(
      "insurance_policy",
      {
        insurer: "Helvetic Muster Leben AG",
        productName: "Risiko-Lebensversicherung",
        category: "risk_death",
        pillar: "3b",
        sumInsured: 200000,
        premium: 1320,
        premiumFrequency: "semiannual",
        startDate: "2017-05-01",
        endDate: "2049-04-30",
        noticePeriodMonths: 3,
        annualCancellation: true,
        insuredPerson: "May Müller",
      },
      "2026-10-30",
    );
    expect(draft).toMatchObject({
      insurer: "Helvetic Muster Leben AG",
      isExternal: true,
      category: "risk_death",
      pillar: "3b",
      premiumAnnual: 2640,
      sumInsured: 200000,
      noticeDate: "2027-01-31",
    });
  });

  it("files a pension certificate as a pillar 2 entry", () => {
    const draft = policyDraftFor(
      "pension_certificate",
      { pensionFund: "Pensionskasse Muster", certificateDate: "2026-01-01", deathLumpSum: 50000 },
      "2026-10-30",
    );
    expect(draft).toMatchObject({
      category: "pension_fund",
      insurer: "Pensionskasse Muster",
      productName: "Vorsorgeausweis 2026",
      sumInsured: 50000,
      premiumAnnual: null,
      details: { subject: "self" },
    });
    const partners = policyDraftFor(
      "pension_certificate",
      { pensionFund: "Pensionskasse Muster" },
      "2026-10-30",
      "partner",
    );
    expect(partners?.details).toMatchObject({ subject: "partner" });
    expect(policyDraftFor("salary_certificate", { grossSalary: 1 }, "2026-10-30")).toBeNull();
  });
});
