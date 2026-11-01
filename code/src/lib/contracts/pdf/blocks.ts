import fontkit from "@pdf-lib/fontkit";
import { type Color, PDFDocument, type PDFImage } from "pdf-lib";
import { formatSwissDate } from "@/lib/documents/dates";
import type { Locale } from "@/lib/domain/taxonomy";
import { formatChf } from "@/lib/utils";
import type { Translate } from "../i18n";
import { ASSETS } from "./assets";
import { Canvas, type TextStyle } from "./canvas";
import { COLOR, CONTENT_WIDTH, PAGE, RADIUS, TYPE, VALUE_WIDTH, VALUE_X } from "./theme";

export const INSURER = "Pax, Schweizerische Lebensversicherungs-Gesellschaft AG";

export const chf = (amount: number, cents = false) => formatChf(amount, "de", cents ? 2 : 0);
export const date = (iso: string | null | undefined) => formatSwissDate(iso);

const LABEL: TextStyle = { size: TYPE.small, weight: "medium", color: COLOR.muted };
const BODY: TextStyle = {};
const LOGO_RATIO = 514 / 1600;

export interface Cover {
  title: string;
  subtitle: string;
  /** Up to three label/value pairs under the title (number, date, status). */
  facts: Array<[string, string]>;
}

export interface Pdf {
  canvas: Canvas;
  t: Translate;
}

/** A document with Pax Civil, the cover band on page 1 and the running logo on later pages. */
export async function createPdf(
  t: Translate,
  meta: { title: string; subject: string; locale: Locale },
  cover: Cover,
): Promise<Pdf> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset: false on purpose: the fonts are pre-subset and pdf-lib's subsetter drops glyphs.
  const [regular, medium, bold, positive, negative] = await Promise.all([
    doc.embedFont(ASSETS.regular),
    doc.embedFont(ASSETS.medium),
    doc.embedFont(ASSETS.bold),
    doc.embedPng(ASSETS.logoPositive),
    doc.embedPng(ASSETS.logoNegative),
  ]);
  doc.setTitle(meta.title, { showInWindowTitleBar: true });
  doc.setSubject(meta.subject);
  doc.setAuthor(INSURER);
  doc.setCreator("Pax Clara (Prototyp)");
  doc.setLanguage(meta.locale);

  const canvas = new Canvas(doc, { regular, medium, bold }, (c) =>
    c.doc.getPageCount() === 1 ? coverBand(c, t, cover, negative) : runningHeader(c, positive),
  );
  canvas.addPage();
  return { canvas, t };
}

/** Page 1: Pax Purple band with the negative logo, the Demo badge and a Pax Green headline. */
function coverBand(c: Canvas, t: Translate, cover: Cover, logo: PDFImage): number {
  const x = PAGE.marginX;
  const top = PAGE.height;
  const titleWidth = CONTENT_WIDTH - 40;
  const subtitleH = c.measure(cover.subtitle, titleWidth, {
    size: TYPE.subtitle,
    weight: "medium",
    leading: 1.3,
  });
  const factsTop = 160 + subtitleH;
  const height = factsTop + 48;

  c.rect(0, top, PAGE.width, height, COLOR.purple);
  const logoH = 22;
  c.page.drawImage(logo, { x, y: top - 40 - logoH, width: logoH / LOGO_RATIO, height: logoH });

  // "Störer" badge: the only place an accent colour appears, as in the app's Demo badge.
  const badge = t("contracts.demo.badge");
  const badgeW = c.width(badge, { size: TYPE.small, weight: "medium" }) + 18;
  const badgeH = 17;
  const badgeX = PAGE.width - x - badgeW;
  const badgeTop = top - 40 - (logoH - badgeH) / 2;
  c.roundedRect(badgeX, badgeTop, badgeW, badgeH, badgeH / 2, COLOR.yellow);
  c.line(badge, badgeX + 9, badgeTop - 11.6, { size: TYPE.small, weight: "medium" });

  c.y = top - 102;
  c.text(cover.title, x, titleWidth, {
    size: TYPE.title,
    weight: "bold",
    color: COLOR.green,
    leading: 1.15,
  });
  c.y -= 4;
  c.text(cover.subtitle, x, titleWidth, {
    size: TYPE.subtitle,
    weight: "medium",
    color: COLOR.white,
    leading: 1.3,
  });

  const columnW = CONTENT_WIDTH / 3;
  cover.facts.forEach(([label, value], i) => {
    const fx = x + i * columnW;
    c.line(label, fx, top - factsTop - 4, { size: TYPE.small, color: COLOR.onPurpleMuted });
    c.line(value, fx, top - factsTop - 19, {
      size: TYPE.body + 0.5,
      weight: "medium",
      color: COLOR.white,
    });
  });
  return top - height - 30;
}

function runningHeader(c: Canvas, logo: PDFImage): number {
  const h = 15;
  const w = h / LOGO_RATIO;
  c.page.drawImage(logo, {
    x: PAGE.width - PAGE.marginX - w,
    y: PAGE.height - 40 - h,
    width: w,
    height: h,
  });
  return PAGE.height - PAGE.top - 22;
}

/** Footer on every page: demo notice, insurer, document number and page count. */
export function finish(pdf: Pdf, reference: string): Promise<Uint8Array> {
  const { canvas: c, t } = pdf;
  const pages = c.doc.getPages();
  pages.forEach((page, i) => {
    c.page = page;
    const x = PAGE.marginX;
    c.rect(x, 61.5, 4.5, 4.5, COLOR.yellow);
    c.line(t("contracts.demo.notice"), x + 10, 57.2, { size: TYPE.tiny, color: COLOR.deepPurple });
    c.hairline(x, 46, CONTENT_WIDTH, COLOR.lineStrong);
    const style = { size: TYPE.tiny, color: COLOR.muted };
    c.line(INSURER, x, 32, style);
    c.line(reference, x + CONTENT_WIDTH * 0.62, 32, style);
    c.line(
      t("contracts.page", { page: i + 1, total: pages.length }),
      PAGE.width - x,
      32,
      style,
      "right",
    );
  });
  return c.doc.save();
}

/** Section heading after the square rule of Pax documents; keeps `keep` points with it. */
export function section(pdf: Pdf, title: string, keep = 40): void {
  const c = pdf.canvas;
  const headingH = c.measure(title, CONTENT_WIDTH, { size: TYPE.heading, weight: "bold" });
  c.ensure(22 + headingH + 10 + keep);
  c.y -= 22;
  c.squareRule(PAGE.marginX, c.y, CONTENT_WIDTH);
  c.y -= 14;
  c.text(title, PAGE.marginX, CONTENT_WIDTH, {
    size: TYPE.heading,
    weight: "bold",
    color: COLOR.purple,
    leading: 1.3,
  });
  c.y -= 8;
}

export interface Part {
  text: string;
  style?: TextStyle;
}

const baseline = (c: Canvas, style: TextStyle) =>
  (c.lineHeight(style) + (style.size ?? TYPE.body) * 0.7) / 2;

/** One label/value row of the Pax grid. The value can stack several styled parts. */
export function row(pdf: Pdf, label: string, value: string | Part[], marker?: Color | "open") {
  const c = pdf.canvas;
  const parts: Part[] = typeof value === "string" ? [{ text: value }] : value;
  const indent = marker ? 13 : 0;
  const width = VALUE_WIDTH - indent;
  const valueH = parts.reduce((h, p) => h + c.measure(p.text, width, p.style ?? BODY), 0);
  const labelH = c.measure(label, PAGE.labelWidth, LABEL);
  const first = parts[0]?.style ?? BODY;
  const offset = baseline(c, first) - baseline(c, LABEL);
  c.ensure(Math.max(valueH, labelH + offset));
  const top = c.y;
  c.textAt(label, PAGE.marginX, top - offset, PAGE.labelWidth, LABEL);
  if (marker) {
    const size = 5.5;
    const y = top - baseline(c, first);
    if (marker === "open") {
      c.page.drawRectangle({
        x: VALUE_X + 0.5,
        y: y + 0.5,
        width: size - 1,
        height: size - 1,
        borderColor: COLOR.subtle,
        borderWidth: 1,
      });
    } else c.rect(VALUE_X, y + size, size, size, marker);
  }
  for (const part of parts) c.text(part.text, VALUE_X + indent, width, part.style ?? BODY);
  c.y = Math.min(c.y, top - labelH - offset) - 6;
}

/** A paragraph in the value column (intro, notes). */
export function paragraph(pdf: Pdf, text: string, style: TextStyle = BODY): void {
  pdf.canvas.text(text, VALUE_X, VALUE_WIDTH, style);
  pdf.canvas.y -= 6;
}

export interface TableRow {
  benefit: string;
  due: string;
  amount: string;
  /** Rows of one group (e.g. the scenarios of one benefit) stay on one page, without rules. */
  group?: string;
}

/** Full-width table: benefit, when it is due, amount (right-aligned). */
export function table(pdf: Pdf, head: TableRow, rows: TableRow[]): void {
  const c = pdf.canvas;
  const x = PAGE.marginX;
  const dueX = x + 196;
  const benefitW = dueX - x - 14;
  const amountW = 118;
  const dueW = PAGE.width - PAGE.marginX - amountW - dueX - 10;
  const right = PAGE.width - PAGE.marginX;
  const cell = (r: TableRow, style: TextStyle, top: number) => {
    const h = Math.max(
      c.textAt(r.benefit, x, top, benefitW, style),
      c.textAt(r.due, dueX, top, dueW, { ...style, color: style.color ?? COLOR.muted }),
    );
    const lines = c.wrap(r.amount, amountW, style);
    lines.forEach((l, i) => {
      c.line(l, right, top - i * c.lineHeight(style) - baseline(c, style), style, "right");
    });
    return Math.max(h, lines.length * c.lineHeight(style));
  };
  const rowH = (r: TableRow, style: TextStyle) =>
    Math.max(
      c.measure(r.benefit, benefitW, style),
      c.measure(r.due, dueW, style),
      c.measure(r.amount, amountW, style),
    );

  /** Height of row i, or of its whole group when it starts one. */
  const blockH = (i: number) => {
    const r = rows[i];
    if (!r) return 0;
    if (!r.group || rows[i - 1]?.group === r.group) return rowH(r, BODY) + 12;
    return rows.filter((g) => g.group === r.group).reduce((sum, g) => sum + rowH(g, BODY) + 12, 0);
  };

  c.ensure(rowH(head, LABEL) + 4 + blockH(0));
  c.y -= cell(head, LABEL, c.y) + 4;
  c.hairline(x, c.y, CONTENT_WIDTH, COLOR.lineStrong, 0.8);
  rows.forEach((r, i) => {
    const h = rowH(r, BODY);
    c.ensure(blockH(i));
    c.y -= 6;
    cell(r, BODY, c.y);
    c.y -= h + 6;
    const endsGroup = !r.group || rows[i + 1]?.group !== r.group;
    if (endsGroup) c.hairline(x, c.y, CONTENT_WIDTH);
    else c.y += 6;
  });
  c.y -= 4;
}

/** Square bullets in the value column. */
export function list(pdf: Pdf, items: string[], style: TextStyle = BODY): void {
  const c = pdf.canvas;
  for (const item of items) {
    c.ensure(c.measure(item, VALUE_WIDTH - 12, style));
    const y = c.y - baseline(c, style);
    c.rect(VALUE_X, y + 4.5, 3.5, 3.5, COLOR.purple);
    c.text(item, VALUE_X + 12, VALUE_WIDTH - 12, style);
    c.y -= 3;
  }
}

export interface PremiumFigure {
  amount: string;
  unit: string;
}

/**
 * The premium panel (Light Purple info box): the amount large on the left, payment terms as
 * small label/value pairs on the right.
 */
export function premiumPanel(
  pdf: Pdf,
  label: string,
  figures: PremiumFigure[],
  details: Array<[string, string]>,
): void {
  const c = pdf.canvas;
  const pad = 16;
  const x = PAGE.marginX;
  const leftW = 196;
  const rightX = x + pad + leftW + 16;
  const rightW = PAGE.width - PAGE.marginX - pad - rightX;
  const amountStyle: TextStyle = { size: TYPE.amount, weight: "bold", color: COLOR.purple };
  const unitStyle: TextStyle = { size: TYPE.body, color: COLOR.deepPurple };
  const figureH = c.lineHeight({ size: TYPE.amount, leading: 1.25 });
  const leftH = 14 + figures.length * figureH;
  const detailH = details.reduce(
    (h, [l, v]) =>
      h + c.measure(l, rightW, LABEL) + c.measure(v, rightW, { size: TYPE.small + 0.5 }) + 5,
    0,
  );
  const height = Math.max(leftH, detailH) + 2 * pad - 4;
  c.ensure(height);
  const top = c.y;
  c.roundedRect(x, top, CONTENT_WIDTH, height, RADIUS.m, COLOR.lightPurple);

  c.line(label, x + pad, top - pad - 7, { ...LABEL, color: COLOR.deepPurple });
  figures.forEach((f, i) => {
    const y = top - pad - 14 - (i + 1) * figureH + 6;
    c.line(f.amount, x + pad, y, amountStyle);
    c.line(f.unit, x + pad + c.width(f.amount, amountStyle) + 6, y, unitStyle);
  });

  c.y = top - pad + 2;
  for (const [l, v] of details) {
    c.text(l, rightX, rightW, { ...LABEL, color: COLOR.deepPurple });
    c.text(v, rightX, rightW, { size: TYPE.small + 0.5 });
    c.y -= 5;
  }
  c.y = top - height - 6;
}
