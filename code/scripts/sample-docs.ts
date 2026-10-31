/**
 * Generates fictional demo documents for the upload flow (Q38) into public/samples/:
 * two pension certificates, an external term-life policy and a salary certificate.
 * All companies and people are invented ("Muster"); numbers follow Swiss conventions.
 * Run: pnpm exec tsx scripts/sample-docs.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const OUT_DIR = path.join(process.cwd(), "public", "samples");
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.83, 0.83, 0.83);

/** CHF 1'234.50 */
function chf(amount: number): string {
  const [int, dec] = amount.toFixed(2).split(".");
  return `CHF ${int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${dec}`;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Minimal flowing layout: a cursor that moves down the page. */
class Sheet {
  y: number;
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
    readonly accent: ReturnType<typeof rgb>,
  ) {
    this.y = A4[1] - MARGIN;
  }

  text(
    value: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) {
    this.page.drawText(value, {
      x: opts.x ?? MARGIN,
      y: this.y,
      size: opts.size ?? 10,
      font: opts.bold ? this.fonts.bold : this.fonts.regular,
      color: opts.color ?? INK,
    });
  }

  gap(points: number) {
    this.y -= points;
  }

  letterhead(company: string, lines: string[]) {
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 4,
      width: 14,
      height: 14,
      color: this.accent,
    });
    this.text(company, { x: MARGIN + 22, size: 14, bold: true });
    this.gap(16);
    for (const line of lines) {
      this.text(line, { x: MARGIN + 22, size: 8.5, color: MUTED });
      this.gap(11);
    }
    this.gap(18);
  }

  title(value: string, subtitle?: string) {
    this.text(value, { size: 17, bold: true });
    this.gap(18);
    if (subtitle) {
      this.text(subtitle, { size: 10, color: MUTED });
      this.gap(14);
    }
    this.gap(8);
  }

  section(label: string) {
    this.gap(6);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 5,
      width: A4[0] - 2 * MARGIN,
      height: 18,
      color: rgb(0.95, 0.95, 0.95),
    });
    this.text(label, { x: MARGIN + 6, size: 10, bold: true });
    this.gap(22);
  }

  /** Label left, value right-aligned, hairline below. */
  row(label: string, value: string, note?: string) {
    const size = 9.5;
    this.text(label, { size });
    const width = this.fonts.regular.widthOfTextAtSize(value, size);
    this.text(value, { x: A4[0] - MARGIN - width, size });
    if (note) {
      this.gap(11);
      this.text(note, { size: 7.5, color: MUTED });
    }
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 5 },
      end: { x: A4[0] - MARGIN, y: this.y - 5 },
      thickness: 0.4,
      color: RULE,
    });
    this.gap(17);
  }

  paragraph(value: string, size = 8.5, color = MUTED) {
    const maxWidth = A4[0] - 2 * MARGIN;
    let line = "";
    for (const word of value.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (this.fonts.regular.widthOfTextAtSize(next, size) > maxWidth) {
        this.text(line, { size, color });
        this.gap(size + 3);
        line = word;
      } else line = next;
    }
    if (line) {
      this.text(line, { size, color });
      this.gap(size + 3);
    }
  }

  footer(value: string) {
    this.page.drawText(value, {
      x: MARGIN,
      y: 32,
      size: 7,
      font: this.fonts.regular,
      color: MUTED,
    });
  }
}

const DISCLAIMER =
  "Fiktives Musterdokument für die Demo von Pax Clara (BaselHack 2026). Firmen und Personen sind erfunden.";

async function newDocument(title: string, accent: ReturnType<typeof rgb>) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor("BaselHack 2026 Demo");
  pdf.setCreationDate(new Date("2026-01-15T09:00:00Z"));
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  return { pdf, newSheet: () => new Sheet(pdf.addPage(A4), fonts, accent) };
}

// ─── Vorsorgeausweis ────────────────────────────────────────────────────────

interface PensionPerson {
  file: string;
  salutation: string;
  name: string;
  birthDate: string;
  civilStatus: string;
  insuranceNumber: string;
  employer: string;
  entry: string;
  workload: number;
  salary: number;
  coordination: number;
  capital: number;
  projectedCapital: number;
  retirementYear: string;
  disability: number;
  partner: number;
  child: number;
  deathLumpSum: number;
  employee: number;
  employer_: number;
  maxBuyIn: number;
}

async function pensionCertificate(p: PensionPerson) {
  const { pdf, newSheet } = await newDocument(
    `Vorsorgeausweis 2026 ${p.name}`,
    rgb(0.13, 0.35, 0.55),
  );
  const s = newSheet();
  s.letterhead("Pensionskasse Muster", [
    "Vorsorgestiftung der Muster-Gruppe",
    "Musterstrasse 1, 4000 Basel, Telefon 061 000 00 00",
  ]);
  s.title("Persönlicher Vorsorgeausweis", "Stand per 01.01.2026, alle Beträge in CHF");

  s.section("Versicherte Person");
  s.row("Name", `${p.salutation} ${p.name}`);
  s.row("Geburtsdatum", p.birthDate);
  s.row("Zivilstand", p.civilStatus);
  s.row("Versicherten-Nr.", p.insuranceNumber);
  s.row("Arbeitgeber", p.employer);
  s.row("Eintritt in die Vorsorgeeinrichtung", p.entry);
  s.row("Beschäftigungsgrad", `${p.workload}%`);

  s.section("Lohndaten");
  s.row("Massgebender Jahreslohn (AHV-Lohn)", chf(p.salary));
  s.row(
    "Koordinationsabzug",
    chf(p.coordination),
    p.workload < 100 ? "dem Beschäftigungsgrad angepasst" : undefined,
  );
  s.row("Versicherter Lohn", chf(p.salary - p.coordination));

  s.section("Altersleistungen");
  s.row("Altersguthaben per 01.01.2026", chf(p.capital));
  s.row(
    `Projiziertes Altersguthaben mit 65 (${p.retirementYear})`,
    chf(p.projectedCapital),
    "mit einem Projektionszins von 1.25%",
  );
  s.row("Umwandlungssatz mit 65", "6.00%");
  s.row("Projizierte jährliche Altersrente mit 65", chf(Math.round(p.projectedCapital * 0.06)));
  s.row("Ordentliches Rentenalter", "65");

  s.section("Leistungen bei Invalidität und Tod");
  s.row("Jährliche Invalidenrente", chf(p.disability), "nach einer Wartefrist von 24 Monaten");
  s.row("Jährliche Invaliden-Kinderrente je Kind", chf(p.child));
  s.row("Jährliche Ehegatten- oder Lebenspartnerrente", chf(p.partner));
  s.row("Jährliche Waisenrente je Kind", chf(p.child));
  s.row("Zusätzliches Todesfallkapital", p.deathLumpSum > 0 ? chf(p.deathLumpSum) : "keines");

  s.section("Finanzierung und Einkauf");
  s.row("Beiträge Arbeitnehmer pro Jahr", chf(p.employee));
  s.row("Beiträge Arbeitgeber pro Jahr", chf(p.employer_));
  s.row(
    "Maximal möglicher Einkauf per 01.01.2026",
    chf(p.maxBuyIn),
    "Einkäufe sind vom steuerbaren Einkommen abziehbar. Kapitalbezug frühestens 3 Jahre nach dem Einkauf.",
  );

  s.gap(8);
  s.paragraph(
    "Massgebend sind das Reglement der Pensionskasse Muster und die gesetzlichen Bestimmungen. Die projizierten Leistungen sind unverbindlich und beruhen auf dem aktuellen versicherten Lohn.",
  );
  s.footer(DISCLAIMER);
  writeFileSync(path.join(OUT_DIR, p.file), await pdf.save());
}

// ─── Fremdpolice ────────────────────────────────────────────────────────────

async function termLifePolicy() {
  const { pdf, newSheet } = await newDocument("Police HML-2017-0048213", rgb(0.62, 0.12, 0.16));
  const s = newSheet();
  s.letterhead("Helvetic Muster Leben AG", [
    "Beispielweg 12, 8000 Zürich",
    "Kundendienst 044 000 00 00, service@helvetic-muster.example",
  ]);
  s.title(
    "Police Nr. HML-2017-0048213",
    "Risiko-Lebensversicherung «Basic Protect», freie Vorsorge (Säule 3b)",
  );

  s.section("Vertragsparteien");
  s.row("Versicherungsnehmer", "Herr May Müller, Musterweg 5, 4053 Basel");
  s.row("Versicherte Person", "Herr May Müller");
  s.row("Geburtsdatum", "16.09.1984");
  s.row("Tarif", "Nichtraucher");

  s.section("Laufzeit");
  s.row("Versicherungsbeginn", "01.05.2017");
  s.row("Vertragsablauf", "30.04.2049");
  s.row("Versicherungsjahr", "jeweils 01.05. bis 30.04.");

  s.section("Versicherte Leistungen");
  s.row("Todesfallkapital (konstant)", chf(200000));
  s.row("Rückkaufswert", "keiner (reine Risikoversicherung)");
  s.row("Begünstigung", "1. die Ehegattin, 2. die Nachkommen zu gleichen Teilen");

  s.section("Prämie");
  s.row("Prämie halbjährlich", chf(1320), "fällig jeweils am 01.05. und 01.11.");
  s.row("Jahresprämie", chf(2640));
  s.row("Überschussbeteiligung", "keine garantierte Überschussbeteiligung");

  s.section("Kündigung");
  s.paragraph(
    "Der Versicherungsnehmer kann den Vertrag jeweils auf das Ende eines Versicherungsjahres (30.04.) unter Einhaltung einer Kündigungsfrist von 3 Monaten schriftlich kündigen. Ohne Kündigung läuft der Vertrag bis zum Vertragsablauf weiter.",
    9,
    INK,
  );

  s.gap(10);
  s.paragraph(
    "Es gelten die Allgemeinen Versicherungsbedingungen (AVB) Ausgabe 2017. Ausgestellt in Zürich am 15.04.2017.",
  );
  s.footer(DISCLAIMER);
  writeFileSync(
    path.join(OUT_DIR, "police-helvetic-muster-todesfall-may-mueller.pdf"),
    await pdf.save(),
  );
}

// ─── Lohnausweis ────────────────────────────────────────────────────────────

async function salaryCertificate() {
  const { pdf, newSheet } = await newDocument("Lohnausweis 2025 May Müller", rgb(0.2, 0.2, 0.2));
  const s = newSheet();
  s.title("Lohnausweis", "Formular 11, Jahr 2025 (01.01.2025 bis 31.12.2025)");
  s.row("C  AHV-Nr.", "756.****.****.**");
  s.row("H  Arbeitnehmer", "May Müller, Musterweg 5, 4053 Basel");
  s.row("I  Arbeitgeber", "Muster Logistik AG, Musterstrasse 10, 4000 Basel");
  s.gap(6);

  s.section("Lohn und Abzüge");
  s.row("1.  Lohn", chf(100000));
  s.row("8.  Bruttolohn total", chf(100000));
  s.row("9.  Beiträge AHV/IV/EO/ALV/NBUV", `– ${chf(6900)}`);
  s.row("10.1  Berufliche Vorsorge, ordentliche Beiträge", `– ${chf(4412.4)}`);
  s.row("11.  Nettolohn", chf(88687.6));
  s.row("13.  Spesenvergütungen", chf(0));
  s.row("15.  Bemerkungen", "Beschäftigungsgrad 100%");

  s.gap(10);
  s.paragraph("Ort und Datum: Basel, 20.01.2026. Muster Logistik AG, Personalabteilung.");
  s.footer(DISCLAIMER);
  writeFileSync(path.join(OUT_DIR, "lohnausweis-2025-may-mueller.pdf"), await pdf.save());
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await pensionCertificate({
    file: "vorsorgeausweis-2026-may-mueller.pdf",
    salutation: "Herr",
    name: "May Müller",
    birthDate: "16.09.1984",
    civilStatus: "verheiratet",
    insuranceNumber: "PKM-104-2231",
    employer: "Muster Logistik AG, Basel",
    entry: "01.03.2014",
    workload: 100,
    salary: 100000,
    coordination: 26460,
    capital: 185400,
    projectedCapital: 548900,
    retirementYear: "2049",
    disability: 29416,
    partner: 17650,
    child: 5883,
    deathLumpSum: 50000,
    employee: 4412.4,
    employer_: 5516,
    maxBuyIn: 86350,
  });
  await pensionCertificate({
    file: "vorsorgeausweis-2026-taylor-johnson.pdf",
    salutation: "Herr",
    name: "Taylor Johnson",
    birthDate: "16.09.1995",
    civilStatus: "ledig",
    insuranceNumber: "PKM-311-0457",
    employer: "Beispiel Software AG, Zürich",
    entry: "01.08.2020",
    workload: 90,
    salary: 100000,
    coordination: 23814,
    capital: 41870,
    projectedCapital: 468300,
    retirementYear: "2060",
    disability: 30474,
    partner: 18285,
    child: 6095,
    deathLumpSum: 0,
    employee: 3428.4,
    employer_: 4190.25,
    maxBuyIn: 132600,
  });
  await termLifePolicy();
  await salaryCertificate();
  console.log(`Sample documents written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
