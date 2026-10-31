/**
 * Generates the demo documents for the upload flow into public/samples/. They tell one story:
 * May Müller (born 16.09.1984, married to the seeded demo customer Jane Müller, one child born
 * 2026, Basel 4053) works full time at Muster Logistik AG for CHF 100'000 a year. His salary
 * certificate, pension fund certificate and an older term life policy agree with each other
 * and with the seed. A second pension certificate belongs to the seeded Taylor Johnson.
 * Every company and person is invented; each page carries a "Muster" watermark and footer.
 * Run: pnpm exec tsx scripts/sample-docs.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  type RGB,
  rgb,
  StandardFonts,
} from "pdf-lib";

const OUT_DIR = path.join(process.cwd(), "public", "samples");
const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.75, 0.75, 0.75);
const TINT = rgb(0.94, 0.94, 0.94);

const DISCLAIMER =
  "Muster: fiktives Dokument für die Demo des Pax Vorsorge-Beraters (BaselHack 2026). Firmen, Personen und Nummern sind erfunden.";

// ─── Formatting ─────────────────────────────────────────────────────────────

/** 1'234.50 (Swiss grouping) */
function amount(value: number, decimals = 2): string {
  const [int, dec] = value.toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return dec ? `${grouped}.${dec}` : grouped;
}

// ─── Drawing primitives (y measured from the top of the page) ───────────────

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: "left" | "right";
}

class Canvas {
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
  ) {}

  width(value: string, size: number, bold = false): number {
    return (bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(value, size);
  }

  text(value: string, x: number, top: number, opts: TextOptions = {}) {
    const size = opts.size ?? 9;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const left = opts.align === "right" ? x - font.widthOfTextAtSize(value, size) : x;
    this.page.drawText(value, {
      x: left,
      y: A4[1] - top - size,
      size,
      font,
      color: opts.color ?? INK,
    });
  }

  /** Wraps on spaces; returns the height used. */
  paragraph(value: string, x: number, top: number, maxWidth: number, opts: TextOptions = {}) {
    const size = opts.size ?? 8.5;
    const lineHeight = size * 1.35;
    let line = "";
    let y = top;
    for (const word of value.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (this.width(next, size, opts.bold) > maxWidth && line) {
        this.text(line, x, y, opts);
        y += lineHeight;
        line = word;
      } else line = next;
    }
    if (line) {
      this.text(line, x, y, opts);
      y += lineHeight;
    }
    return y - top;
  }

  line(x1: number, top1: number, x2: number, top2: number, thickness = 0.5, color = RULE) {
    this.page.drawLine({
      start: { x: x1, y: A4[1] - top1 },
      end: { x: x2, y: A4[1] - top2 },
      thickness,
      color,
    });
  }

  rect(
    x: number,
    top: number,
    w: number,
    h: number,
    opts: { fill?: RGB; border?: RGB; thickness?: number } = {},
  ) {
    this.page.drawRectangle({
      x,
      y: A4[1] - top - h,
      width: w,
      height: h,
      color: opts.fill,
      borderColor: opts.border,
      borderWidth: opts.border ? (opts.thickness ?? 0.6) : 0,
    });
  }

  checkbox(x: number, top: number, checked: boolean) {
    this.rect(x, top, 8, 8, { border: INK, thickness: 0.7 });
    if (checked) {
      this.line(x + 1.5, top + 1.5, x + 6.5, top + 6.5, 0.9, INK);
      this.line(x + 6.5, top + 1.5, x + 1.5, top + 6.5, 0.9, INK);
    }
  }

  /** The specimen mark: a large diagonal "MUSTER" behind the content and a footer line. */
  specimen(pageLabel?: string) {
    const size = 120;
    const word = "MUSTER";
    const w = this.fonts.bold.widthOfTextAtSize(word, size);
    const angle = 35;
    const rad = (angle * Math.PI) / 180;
    this.page.drawText(word, {
      x: A4[0] / 2 - (w / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
      y: A4[1] / 2 - (w / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
      size,
      font: this.fonts.bold,
      color: rgb(0.85, 0.85, 0.85),
      opacity: 0.35,
      rotate: degrees(angle),
    });
    this.text(DISCLAIMER, 36, A4[1] - 30, { size: 6.5, color: MUTED });
    if (pageLabel) this.text(pageLabel, A4[0] - 36, A4[1] - 30, { size: 6.5, align: "right" });
  }
}

async function newDocument(title: string, subject: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setSubject(subject);
  pdf.setAuthor("Muster (BaselHack 2026 Demo)");
  pdf.setCreator("scripts/sample-docs.ts");
  pdf.setCreationDate(new Date("2026-01-20T09:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-20T09:00:00Z"));
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  return { pdf, addPage: () => new Canvas(pdf.addPage(A4), fonts) };
}

async function save(pdf: PDFDocument, file: string) {
  writeFileSync(path.join(OUT_DIR, file), await pdf.save());
  console.log(`  ${file}`);
}

// ─── The demo story ─────────────────────────────────────────────────────────

const MAY = {
  name: "May Müller",
  salutation: "Herr",
  street: "Musterweg 5",
  town: "4053 Basel",
  birthDate: "16.09.1984",
  ahv: "756.1234.5678.97",
};

const EMPLOYER = {
  name: "Muster Logistik AG",
  street: "Musterstrasse 10",
  town: "4057 Basel",
  phone: "061 000 00 00",
};

/** Salary 2025: AHV/IV/EO 5.3%, ALV 1.1%, NBUV 0.5%; BVG employee share from the fund plan. */
const SALARY_2025 = {
  gross: 100000,
  social: 6900,
  /** 6% of the insured salary (100'000 – 26'460), whole francs as on the form. */
  pension: 4412,
};

// ─── Lohnausweis (Formular 11) ──────────────────────────────────────────────

async function salaryCertificate() {
  const { pdf, addPage } = await newDocument(
    "Lohnausweis 2025 May Müller",
    "Lohnausweis Formular 11, Muster",
  );
  const c = addPage();
  c.specimen();
  const L = 36;
  const R = A4[0] - 36;

  // Title band
  c.text("Lohnausweis", L, 34, { size: 15, bold: true });
  c.text("Certificat de salaire / Certificato di salario", L, 52, { size: 8, color: MUTED });
  c.text("Formular 11", R, 36, { size: 8, align: "right", color: MUTED });

  // A–G
  let y = 80;
  c.checkbox(L, y, true);
  c.text("A", L + 14, y, { bold: true });
  c.text("Lohnausweis", L + 26, y);
  c.checkbox(L + 120, y, false);
  c.text("B", L + 134, y, { bold: true });
  c.text("Rentenbescheinigung", L + 146, y);

  y += 22;
  c.text("C", L, y, { bold: true });
  c.text("AHV-Nr.", L + 14, y, { color: MUTED, size: 8 });
  c.text(MAY.ahv, L + 60, y, { size: 10 });
  y += 20;
  c.text("D", L, y, { bold: true });
  c.text("Jahr", L + 14, y, { color: MUTED, size: 8 });
  c.text("2025", L + 60, y, { size: 10 });
  c.text("E", L + 110, y, { bold: true });
  c.text("von", L + 124, y, { color: MUTED, size: 8 });
  c.text("01.01.2025", L + 142, y, { size: 10 });
  c.text("bis", L + 204, y, { color: MUTED, size: 8 });
  c.text("31.12.2025", L + 220, y, { size: 10 });
  y += 24;
  c.checkbox(L, y, false);
  c.text("F", L + 14, y, { bold: true });
  c.text("Unentgeltliche Beförderung zwischen Wohn- und Arbeitsort", L + 26, y, { size: 8 });
  y += 16;
  c.checkbox(L, y, false);
  c.text("G", L + 14, y, { bold: true });
  c.text("Kantinenverpflegung / Lunch-Checks", L + 26, y, { size: 8 });

  // H: employee address in the envelope window
  c.text("H", 330, 80, { bold: true });
  c.rect(344, 76, R - 344, 86, { border: RULE });
  [MAY.salutation, MAY.name, MAY.street, MAY.town].forEach((line, i) => {
    c.text(line, 356, 90 + i * 14, { size: 10 });
  });

  // Rows 1–15
  type Row = {
    no: string;
    label: string;
    sign?: "–" | "=";
    value?: number;
    sub?: boolean;
    bold?: boolean;
  };
  const rows: Row[] = [
    {
      no: "1.",
      label: "Lohn soweit nicht unter Ziffer 2–7 aufzuführen / Rente",
      value: SALARY_2025.gross,
    },
    { no: "2.", label: "Gehaltsnebenleistungen" },
    { no: "2.1", label: "Verpflegung, Unterkunft", sub: true },
    { no: "2.2", label: "Privatanteil Geschäftsfahrzeug", sub: true },
    { no: "2.3", label: "Andere (Art angeben)", sub: true },
    { no: "3.", label: "Unregelmässige Leistungen (Art angeben)" },
    { no: "4.", label: "Kapitalleistungen (Art angeben)" },
    { no: "5.", label: "Beteiligungsrechte gemäss Beiblatt" },
    { no: "6.", label: "Verwaltungsratsentschädigungen" },
    { no: "7.", label: "Andere Leistungen (Art angeben)" },
    {
      no: "8.",
      label: "Bruttolohn total / Rente",
      sign: "=",
      value: SALARY_2025.gross,
      bold: true,
    },
    { no: "9.", label: "Beiträge AHV/IV/EO/ALV/NBUV", sign: "–", value: SALARY_2025.social },
    { no: "10.", label: "Berufliche Vorsorge 2. Säule" },
    { no: "10.1", label: "Ordentliche Beiträge", sign: "–", value: SALARY_2025.pension, sub: true },
    { no: "10.2", label: "Beiträge für den Einkauf", sign: "–", sub: true },
    {
      no: "11.",
      label: "Nettolohn / Rente (in die Steuererklärung übertragen)",
      sign: "=",
      value: SALARY_2025.gross - SALARY_2025.social - SALARY_2025.pension,
      bold: true,
    },
    { no: "12.", label: "Quellensteuerabzug" },
    { no: "13.", label: "Spesenvergütungen (nicht im Bruttolohn enthalten)" },
    { no: "13.1", label: "Effektive Spesen: Reise, Verpflegung, Übernachtung / Übrige", sub: true },
    { no: "13.2", label: "Pauschalspesen: Repräsentation / Auto / Übrige", sub: true },
    { no: "13.3", label: "Beiträge an die Weiterbildung", sub: true },
    { no: "14.", label: "Weitere Gehaltsnebenleistungen (Art angeben)" },
  ];

  y = 200;
  const colNo = L;
  const colLabel = L + 34;
  const colSign = 432;
  const colValue = R;
  c.text("Nur ganze Frankenbeträge", colValue, y - 13, {
    size: 7,
    align: "right",
    color: MUTED,
  });
  c.line(L, y, R, y, 0.9, INK);
  c.line(colSign - 6, y, colSign - 6, y + rows.length * 18, 0.5, RULE);
  for (const row of rows) {
    if (row.bold) c.rect(L, y, R - L, 18, { fill: TINT });
    c.text(row.no, colNo + (row.sub ? 10 : 0), y + 5, { size: 8.5, bold: !row.sub });
    c.text(row.label, colLabel + (row.sub ? 14 : 0), y + 5, { size: 8.5, bold: row.bold });
    if (row.sign) c.text(row.sign, colSign, y + 5, { size: 9 });
    if (row.value !== undefined)
      c.text(amount(row.value, 0), colValue - 4, y + 4.5, {
        size: 10,
        bold: row.bold,
        align: "right",
      });
    y += 18;
    c.line(L, y, R, y, row.bold ? 0.8 : 0.4, row.bold ? INK : RULE);
  }

  // 15. Bemerkungen
  y += 8;
  c.text("15.", colNo, y + 2, { size: 8.5, bold: true });
  c.text("Bemerkungen", colLabel, y + 2, { size: 8.5, bold: true });
  c.rect(colLabel, y + 16, R - colLabel, 42, { border: RULE });
  c.paragraph(
    "Beschäftigungsgrad 100 %. Versicherter Lohn berufliche Vorsorge CHF 73'540. Pensionskasse Muster, Versicherten-Nr. PKM-104-2231.",
    colLabel + 8,
    y + 23,
    R - colLabel - 16,
    { size: 8.5 },
  );

  // I: place, date, employer
  y += 76;
  c.text("I", L, y, { bold: true });
  c.text("Ort und Datum", colLabel, y, { size: 7.5, color: MUTED });
  c.text("Basel, 20.01.2026", colLabel, y + 12, { size: 10 });
  const confirm = c.paragraph(
    "Die richtige und vollständige Angabe bestätigt, inkl. genauer Adresse und Telefonnummer des Arbeitgebers",
    250,
    y,
    R - 250,
    { size: 7.5, color: MUTED },
  );
  [
    EMPLOYER.name,
    `${EMPLOYER.street}, ${EMPLOYER.town}`,
    `Telefon ${EMPLOYER.phone}, Personalabteilung`,
  ].forEach((line, i) => {
    c.text(line, 250, y + confirm + 2 + i * 12, { size: 9, bold: i === 0 });
  });
  c.line(250, y + confirm + 70, R, y + confirm + 70, 0.5, INK);
  c.text("Unterschrift", 250, y + confirm + 74, { size: 7, color: MUTED });

  await save(pdf, "lohnausweis-2025-may-mueller.pdf");
}

// ─── Vorsorgeausweis ────────────────────────────────────────────────────────

/**
 * Plan "Standard" of the fictional Pensionskasse Muster: age-graded savings credits on the
 * insured salary, risk 3.0% and costs 0.5%; the employee pays half the savings credit plus 1%.
 */
const PLAN = {
  coordination: 26460,
  interest: 0.0125,
  risk: 0.03,
  costs: 0.005,
  disabilityShare: 0.4,
  partnerShare: 0.6,
  childShare: 0.2,
  conversion: { 58: 0.049, 60: 0.052, 62: 0.055, 63: 0.0565, 64: 0.058, 65: 0.06 } as Record<
    number,
    number
  >,
};

function savingsRate(bvgAge: number): number {
  if (bvgAge < 25) return 0;
  if (bvgAge < 35) return 0.07;
  if (bvgAge < 45) return 0.1;
  if (bvgAge < 55) return 0.15;
  return 0.18;
}

interface PensionPerson {
  file: string;
  salutation: string;
  name: string;
  street: string;
  town: string;
  birthDate: string;
  ahv: string;
  civilStatus: string;
  insuranceNumber: string;
  employer: string;
  entry: string;
  workload: number;
  salary: number;
  capital: number;
  /** Mandatory BVG part of the capital (shown as "davon"). */
  bvgCapital: number;
  deathLumpSum: number;
  maxBuyIn: number;
}

const birth = (p: PensionPerson) => {
  const [, month, year] = p.birthDate.split(".").map(Number);
  return { month, year };
};

/** Projected capital at the end of the month the person reaches `age`, from 01.01.2026. */
function projectedCapital(p: PensionPerson, insured: number, age: number): number {
  const { month, year } = birth(p);
  let capital = p.capital;
  for (let y = 2026; y <= year + age; y++) {
    const share = y === year + age ? month / 12 : 1;
    capital = capital * (1 + PLAN.interest * share) + savingsRate(y - year) * insured * share;
  }
  return round05(capital);
}

/** Margins of the letter-style documents (pension certificate, policy). */
const L = 48;
const R = A4[0] - 48;

const round05 = (value: number) => Math.round(value * 20) / 20;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (month: number, year: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Section bands, label/value rows and a two-column grid for letter-style documents. */
function letterHelpers(accent: RGB) {
  /** Section heading with a tinted band; returns the next top. */
  const section = (c: Canvas, label: string, top: number) => {
    c.rect(L, top, R - L, 17, { fill: TINT });
    c.rect(L, top, 3, 17, { fill: accent });
    c.text(label, L + 10, top + 4.5, { size: 9.5, bold: true });
    return top + 24;
  };
  /** Label/value rows, value right-aligned; returns the next top. */
  const rows = (
    c: Canvas,
    top: number,
    items: Array<[string, string, { bold?: boolean; note?: string }?]>,
  ) => {
    let y = top;
    for (const [label, value, opts] of items) {
      c.text(label, L + 10, y, { size: 9, bold: opts?.bold });
      c.text(value, R - 6, y, { size: 9, bold: opts?.bold, align: "right" });
      if (opts?.note) {
        y += 11;
        c.text(opts.note, L + 10, y, { size: 7, color: MUTED });
      }
      y += 16;
      c.line(L, y - 4, R, y - 4, 0.3);
    }
    return y + 6;
  };
  /** Two label/value pairs per line for the personal data. */
  const grid = (c: Canvas, top: number, pairs: Array<[string, string]>) => {
    const half = (R - L) / 2;
    let y = top;
    pairs.forEach(([label, value], i) => {
      const x = L + 10 + (i % 2) * half;
      c.text(label, x, y, { size: 8, color: MUTED });
      c.text(value, x + 92, y, { size: 9 });
      if (i % 2 === 1 || i === pairs.length - 1) y += 14;
    });
    return y + 6;
  };
  return { section, rows, grid };
}

async function pensionCertificate(p: PensionPerson) {
  const { pdf, addPage } = await newDocument(
    `Vorsorgeausweis 2026 ${p.name}`,
    "Vorsorgeausweis Pensionskasse Muster, Muster",
  );
  const ACCENT = rgb(0.11, 0.33, 0.52);
  const { section, rows, grid } = letterHelpers(ACCENT);
  const coordination = round05(PLAN.coordination * (p.workload / 100));
  const insured = p.salary - coordination;
  const { month, year } = birth(p);
  const savings = savingsRate(2026 - year);
  const disability = round05(insured * PLAN.disabilityShare);
  const retirementDate = `${lastDay(month, year + 65)}.${pad(month)}.${year + 65}`;

  // Page 1
  const c = addPage();
  c.specimen("Seite 1 von 2");
  c.rect(L, 40, 16, 16, { fill: ACCENT });
  c.text("Pensionskasse Muster", L + 24, 41, { size: 14, bold: true });
  c.text("Sammelstiftung für die berufliche Vorsorge", L + 24, 60, { size: 8, color: MUTED });
  c.text("Musterstrasse 12, 4057 Basel", L + 24, 71, { size: 8, color: MUTED });
  c.text("Telefon 061 000 00 10, info@pk-muster.example", L + 24, 82, {
    size: 8,
    color: MUTED,
  });

  ["Persönlich", p.salutation, p.name, p.street, p.town].forEach((line, i) => {
    c.text(line, 330, 120 + i * 13, { size: i === 0 ? 8 : 10, bold: i === 0 });
  });

  c.text("Basel, 15. Januar 2026", L, 210, { size: 9 });
  c.text("Vorsorgeausweis per 1. Januar 2026", L, 232, { size: 16, bold: true });
  c.text("Vorsorgeplan Standard. Alle Beträge in CHF.", L, 253, { size: 9, color: MUTED });

  let y = section(c, "Persönliche Daten", 276);
  y = grid(c, y, [
    ["Name", `${p.salutation} ${p.name}`],
    ["Versicherten-Nr.", p.insuranceNumber],
    ["Geburtsdatum", p.birthDate],
    ["AHV-Nr.", p.ahv],
    ["Zivilstand", p.civilStatus],
    ["Eintritt", p.entry],
    ["Beschäftigungsgrad", `${p.workload} %`],
    ["Rücktrittsdatum", retirementDate],
    ["Arbeitgeber", p.employer],
  ]);

  y = section(c, "Lohn", y);
  y = rows(c, y, [
    ["Massgebender Jahreslohn (AHV-Lohn)", amount(p.salary)],
    [
      "Koordinationsabzug",
      `– ${amount(coordination)}`,
      p.workload < 100 ? { note: `dem Beschäftigungsgrad von ${p.workload} % angepasst` } : {},
    ],
    ["Versicherter Lohn", amount(insured), { bold: true }],
  ]);

  y = section(c, "Altersleistungen", y);
  const at65 = projectedCapital(p, insured, 65);
  const pension65 = round05(at65 * PLAN.conversion[65]);
  y = rows(c, y, [
    ["Altersguthaben per 01.01.2026", amount(p.capital), { bold: true }],
    ["davon Altersguthaben nach BVG (Obligatorium)", amount(p.bvgCapital)],
    [`Projiziertes Altersguthaben mit 65 (${retirementDate})`, amount(at65)],
    ["Projizierte jährliche Altersrente mit 65", amount(pension65), { bold: true }],
  ]);

  // Projection table
  c.text("Projektion bei vorzeitiger und ordentlicher Pensionierung", L + 10, y, {
    size: 8.5,
    bold: true,
  });
  y += 15;
  const cols = [L + 10, L + 60, R - 230, R - 120, R - 6];
  ["Alter", "per", "Altersguthaben", "Umwandlungssatz", "Altersrente p.a."].forEach((h, i) => {
    c.text(h, cols[i], y, { size: 7.5, color: MUTED, align: i >= 2 ? "right" : "left" });
  });
  y += 12;
  c.line(L, y - 2, R, y - 2, 0.6, INK);
  for (const age of [58, 60, 62, 63, 64, 65]) {
    const capital = projectedCapital(p, insured, age);
    const rate = PLAN.conversion[age];
    const bold = age === 65;
    const cells = [
      String(age),
      `${lastDay(month, year + age)}.${pad(month)}.${year + age}`,
      amount(capital),
      `${(rate * 100).toFixed(2)} %`,
      amount(round05(capital * rate)),
    ];
    cells.forEach((cell, i) => {
      c.text(cell, cols[i], y + 2, { size: 8.5, bold, align: i >= 2 ? "right" : "left" });
    });
    y += 14;
    c.line(L, y - 1, R, y - 1, 0.3);
  }
  c.paragraph(
    `Die Projektion rechnet mit einem Zins von ${(PLAN.interest * 100).toFixed(2)} % und dem heutigen versicherten Lohn. Sie ist unverbindlich.`,
    L + 10,
    y + 4,
    R - L - 20,
    { size: 7.5, color: MUTED },
  );

  // Page 2
  const d = addPage();
  d.specimen("Seite 2 von 2");
  d.text(`Vorsorgeausweis per 1. Januar 2026, ${p.name}, ${p.insuranceNumber}`, L, 40, {
    size: 8,
    color: MUTED,
  });

  y = section(d, "Leistungen bei Invalidität", 64);
  y = rows(d, y, [
    [
      "Jährliche Invalidenrente",
      amount(disability),
      { note: "nach einer Wartefrist von 24 Monaten" },
    ],
    ["Jährliche Invaliden-Kinderrente je Kind", amount(round05(disability * PLAN.childShare))],
    ["Beitragsbefreiung", "nach 3 Monaten"],
  ]);

  y = section(d, "Leistungen bei Tod vor der Pensionierung", y);
  y = rows(d, y, [
    [
      "Jährliche Ehegatten- oder Lebenspartnerrente",
      amount(round05(disability * PLAN.partnerShare)),
    ],
    ["Jährliche Waisenrente je Kind", amount(round05(disability * PLAN.childShare))],
    [
      "Zusätzliches Todesfallkapital",
      p.deathLumpSum > 0 ? amount(p.deathLumpSum) : "keines",
      { note: "an die Begünstigten gemäss Reglement" },
    ],
  ]);

  y = section(d, "Beiträge pro Jahr", y);
  const fcols = [L + 10, R - 220, R - 110, R - 6];
  ["Beitrag", "Arbeitnehmer", "Arbeitgeber", "Total"].forEach((h, i) => {
    d.text(h, fcols[i], y, { size: 7.5, color: MUTED, align: i > 0 ? "right" : "left" });
  });
  y += 12;
  d.line(L, y - 2, R, y - 2, 0.6, INK);
  const split: Array<[string, number, number]> = [
    [`Sparbeitrag (${(savings * 100).toFixed(1)} %)`, savings / 2, savings / 2],
    [`Risikobeitrag (${(PLAN.risk * 100).toFixed(1)} %)`, 0.01, PLAN.risk - 0.01],
    [`Verwaltungskosten (${(PLAN.costs * 100).toFixed(1)} %)`, 0, PLAN.costs],
  ];
  const sums = [0, 0];
  for (const [label, employee, employer] of split) {
    const an = round05(insured * employee);
    const ag = round05(insured * employer);
    sums[0] += an;
    sums[1] += ag;
    [label, amount(an), amount(ag), amount(an + ag)].forEach((cell, i) => {
      d.text(cell, fcols[i], y + 2, { size: 8.5, align: i > 0 ? "right" : "left" });
    });
    y += 14;
    d.line(L, y - 1, R, y - 1, 0.3);
  }
  ["Total Beiträge pro Jahr", amount(sums[0]), amount(sums[1]), amount(sums[0] + sums[1])].forEach(
    (cell, i) => {
      d.text(cell, fcols[i], y + 2, { size: 8.5, bold: true, align: i > 0 ? "right" : "left" });
    },
  );
  y += 24;

  y = section(d, "Einkauf und Wohneigentum", y);
  y = rows(d, y, [
    [
      "Maximal möglicher Einkauf per 01.01.2026",
      amount(p.maxBuyIn),
      { note: "Einkäufe sind vom steuerbaren Einkommen abziehbar." },
    ],
    ["Möglicher Vorbezug für Wohneigentum per 01.01.2026", amount(p.capital)],
  ]);

  y += 4;
  y += d.paragraph(
    "Massgebend sind das Vorsorgereglement der Pensionskasse Muster und die gesetzlichen Bestimmungen. Dieser Ausweis ersetzt alle früheren Ausweise. Eine aus einem Einkauf resultierende Leistung darf innerhalb von drei Jahren nicht als Kapital bezogen werden. Bitte prüfen Sie die Angaben und melden Sie Änderungen Ihrer Personalabteilung.",
    L,
    y,
    R - L,
    { size: 8, color: MUTED },
  );
  d.text("Pensionskasse Muster, Verwaltung", L, y + 16, { size: 9, bold: true });

  await save(pdf, p.file);
}

// ─── Police einer anderen Versicherung ──────────────────────────────────────

/** A term life policy May took out in 2017 with another insurer, next to his Pax policy. */
async function termLifePolicy() {
  const { pdf, addPage } = await newDocument(
    "Police ML-2017-0048213 May Müller",
    "Risiko-Lebensversicherung Muster Leben AG, Muster",
  );
  const ACCENT = rgb(0.6, 0.13, 0.17);
  const { section, rows, grid } = letterHelpers(ACCENT);
  const premium = 648;

  const c = addPage();
  c.specimen("Seite 1 von 1");
  c.rect(L, 40, 16, 16, { fill: ACCENT });
  c.text("Muster Leben AG", L + 24, 41, { size: 14, bold: true });
  c.text("Lebensversicherungen", L + 24, 60, { size: 8, color: MUTED });
  c.text("Beispielweg 12, 8001 Zürich", L + 24, 71, { size: 8, color: MUTED });
  c.text("Kundendienst 044 000 00 00, service@muster-leben.example", L + 24, 82, {
    size: 8,
    color: MUTED,
  });

  [MAY.salutation, MAY.name, MAY.street, MAY.town].forEach((line, i) => {
    c.text(line, 330, 120 + i * 13, { size: 10 });
  });

  c.text("Zürich, 15. April 2017", L, 210, { size: 9 });
  c.text("Police Nr. ML-2017-0048213", L, 232, { size: 16, bold: true });
  c.text("Risiko-Lebensversicherung «Familienschutz Konstant», freie Vorsorge (Säule 3b)", L, 253, {
    size: 9,
    color: MUTED,
  });

  let y = section(c, "Vertragsparteien", 276);
  y = grid(c, y, [
    ["Versicherungsnehmer", `${MAY.salutation} ${MAY.name}`],
    ["Versicherte Person", MAY.name],
    ["Adresse", `${MAY.street}, ${MAY.town}`],
    ["Geburtsdatum", MAY.birthDate],
    ["Tarif", "Nichtraucher"],
    ["Kundennummer", "K-5520-1987"],
  ]);

  y = section(c, "Vertragsdauer", y);
  y = rows(c, y, [
    ["Versicherungsbeginn", "01.05.2017"],
    ["Vertragsablauf", "30.04.2049"],
    ["Versicherungsjahr", "jeweils vom 01.05. bis 30.04."],
  ]);

  y = section(c, "Versicherte Leistungen", y);
  y = rows(c, y, [
    [
      "Todesfallkapital, konstant über die ganze Dauer",
      "CHF 200'000.00",
      { bold: true, note: "fällig beim Tod der versicherten Person vor dem Vertragsablauf" },
    ],
    ["Leistung im Erlebensfall", "keine"],
    ["Rückkaufswert", "keiner (reine Risikoversicherung)"],
    ["Begünstigung", "1. die Ehegattin, 2. die Nachkommen zu gleichen Teilen"],
  ]);

  y = section(c, "Prämie", y);
  y = rows(c, y, [
    [
      "Prämie halbjährlich",
      `CHF ${amount(premium)}`,
      { bold: true, note: "fällig jeweils am 01.05. und am 01.11." },
    ],
    ["Jahresprämie", `CHF ${amount(premium * 2)}`],
    ["Überschussbeteiligung", "nicht garantiert, mit der Prämie verrechnet"],
  ]);

  y = section(c, "Kündigung", y);
  y += c.paragraph(
    "Der Versicherungsnehmer kann den Vertrag jeweils auf das Ende eines Versicherungsjahres (30.04.) unter Einhaltung einer Kündigungsfrist von 3 Monaten schriftlich kündigen. Ohne Kündigung läuft der Vertrag bis zum Vertragsablauf weiter.",
    L + 10,
    y,
    R - L - 20,
    { size: 9 },
  );
  y += 12;
  y += c.paragraph(
    "Es gelten die Allgemeinen Versicherungsbedingungen (AVB) für Risiko-Lebensversicherungen, Ausgabe 2017. Diese Police ersetzt alle früheren Policen zu diesem Vertrag.",
    L,
    y,
    R - L,
    { size: 8, color: MUTED },
  );
  c.text("Muster Leben AG", L, y + 14, { size: 9, bold: true });

  await save(pdf, "police-muster-leben-todesfall-may-mueller.pdf");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Writing demo documents to ${OUT_DIR}`);
  await salaryCertificate();
  await pensionCertificate({
    file: "vorsorgeausweis-2026-may-mueller.pdf",
    salutation: MAY.salutation,
    name: MAY.name,
    street: MAY.street,
    town: MAY.town,
    birthDate: MAY.birthDate,
    ahv: MAY.ahv,
    civilStatus: "verheiratet",
    insuranceNumber: "PKM-104-2231",
    employer: `${EMPLOYER.name}, Basel`,
    entry: "01.03.2014",
    workload: 100,
    salary: SALARY_2025.gross,
    capital: 185400,
    bvgCapital: 131250,
    deathLumpSum: 50000,
    maxBuyIn: 86350,
  });
  await pensionCertificate({
    file: "vorsorgeausweis-2026-taylor-johnson.pdf",
    salutation: "Herr",
    name: "Taylor Johnson",
    street: "Beispielgasse 8",
    town: "8004 Zürich",
    birthDate: "16.09.1995",
    ahv: "756.9876.5432.17",
    civilStatus: "ledig",
    insuranceNumber: "PKM-311-0457",
    employer: "Muster Software AG, Zürich",
    entry: "01.08.2020",
    workload: 90,
    salary: 100000,
    capital: 41870,
    bvgCapital: 30120,
    deathLumpSum: 0,
    maxBuyIn: 132600,
  });
  await termLifePolicy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
