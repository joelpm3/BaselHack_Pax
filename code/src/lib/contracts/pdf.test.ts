import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/domain/taxonomy";
import { disabilityOffer, disabilityPolicy, lifestarOffer } from "./fixtures";
import { withdrawalDeadline, zurichDateTime } from "./pdf/sections";
import { TOKENS } from "./pdf/theme";
import { renderContractPdf } from "./render";

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.join("messages", locale, "contracts.json"), "utf8"));

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("contract PDFs", () => {
  it("uses the app's design tokens", () => {
    const css = readFileSync(path.join("src", "app", "globals.css"), "utf8");
    for (const [name, value] of Object.entries(TOKENS))
      expect(css, name).toContain(`--color-${name}: ${value};`);
  });

  it("has the same texts in every language", () => {
    const de = keys(messages("de")).sort();
    for (const locale of LOCALES) expect(keys(messages(locale)).sort(), locale).toEqual(de);
  });

  it.each(LOCALES)("renders a valid Antrag in %s", async (locale) => {
    const { bytes, text, filename } = await renderContractPdf({ ...disabilityOffer, locale });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.getTitle()).toContain("PAX-2026-418203");
    expect(filename).toMatch(/PAX-2026-418203\.pdf$/);

    const all = text.join("\n");
    expect(all).toContain("Anna-Lena Müller-Schönenberger");
    expect(all).toContain("Pax Erwerbsunfähigkeitsversicherung");
    expect(all).toContain("CHF 1'234.50");
    expect(all).toContain("CHF 24'000");
    expect(all).toContain("Pax, Schweizerische Lebensversicherungs-Gesellschaft AG");
    expect(all).toContain("Aeschenplatz 13, 4002 Basel");
    expect(all).toContain("2a"); // VVG Art. 2a withdrawal right
    expect(all).toContain("15.11.2026"); // last day to withdraw
    expect(all).toContain(messages(locale).demo.badge);
    // Every page carries the demo notice; no message key leaked through untranslated.
    const notice = messages(locale).demo.notice;
    expect(text.filter((t) => t === notice)).toHaveLength(pdf.getPageCount());
    expect(text.filter((t) => /^(contracts|sales)\.[a-z]/.test(t))).toEqual([]);
    expect(all).not.toContain("ß");
  });

  it("shows the suitability check, scenarios and alternatives of a unit-linked Antrag", async () => {
    const { text } = await renderContractPdf(lifestarOffer);
    const all = text.join("\n");
    expect(all).toContain("Pax (CH) Sustainable Portfolio 50 ALV T");
    expect(all).toContain("Dynamisch, 103 von 120 Punkten");
    expect(all).toContain("CHF 196'840");
    expect(all).toContain("Pax FondsStar");
    expect(all).toContain("Einkauf in die Pensionskasse");
  });

  it.each(LOCALES)("renders a valid Police in %s", async (locale) => {
    const { bytes, text } = await renderContractPdf({
      ...disabilityPolicy,
      locale,
      beneficiaries: ["Lea Müller, Tochter"],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const all = text.join("\n");
    expect(all).toContain("PAX-2026-418203");
    expect(all).toContain("Sandra Keller");
    expect(all).toContain("Lea Müller, Tochter");
    expect(all).toContain("31.03.2053");
    expect(text.filter((t) => /^(contracts|sales)\.[a-z]/.test(t))).toEqual([]);
  });

  it("replaces characters the font lacks instead of dropping them", async () => {
    const { text } = await renderContractPdf({
      ...disabilityPolicy,
      policyholder: { ...disabilityPolicy.policyholder, name: "Ștefan Zoë 李" },
    });
    expect(text.join("\n")).toContain("Ștefan Zoë ?");
  });
});

describe("contract dates", () => {
  it("shows the signing time in Swiss local time", () => {
    expect(zurichDateTime("2026-11-01T13:05:00.000Z")).toEqual({
      date: "01.11.2026",
      time: "14:05",
      isoDate: "2026-11-01",
    });
    expect(zurichDateTime("2026-06-30T22:30:00.000Z").isoDate).toBe("2026-07-01");
  });

  it("ends the withdrawal period 14 days after signing", () => {
    expect(withdrawalDeadline("2026-12-25")).toBe("2027-01-08");
  });
});
