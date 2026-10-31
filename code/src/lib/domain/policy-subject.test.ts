import { describe, expect, it } from "vitest";
import { subjectOfPolicy } from "./policy-subject";
import { lifeSituationSchema } from "./profile";

const mueller = lifeSituationSchema.parse({
  person: { firstName: "Jane" },
  partner: { firstName: "May" },
});

describe("subjectOfPolicy", () => {
  it("assigns policies by insured first name", () => {
    expect(subjectOfPolicy({ insuredPerson: "May Müller" }, mueller)).toBe("partner");
    expect(subjectOfPolicy({ insuredPerson: "JANE MÜLLER" }, mueller)).toBe("self");
    expect(subjectOfPolicy({ insuredPerson: null }, mueller)).toBe("self");
    expect(subjectOfPolicy({ insuredPerson: "Lena Müller" }, mueller)).toBe("other");
  });

  it("trusts the subject the customer chose for a document over the name", () => {
    const certificate = { insuredPerson: "Pensionskasse Muster", details: { subject: "partner" } };
    expect(subjectOfPolicy(certificate, mueller)).toBe("partner");
    expect(
      subjectOfPolicy({ insuredPerson: "May Müller", details: { subject: "self" } }, mueller),
    ).toBe("self");
  });
});
