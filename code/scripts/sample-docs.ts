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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Writing demo documents to ${OUT_DIR}`);
  await salaryCertificate();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
