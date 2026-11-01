import type { Color, PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { COLOR, PAGE, TYPE } from "./theme";

export interface Fonts {
  regular: PDFFont;
  medium: PDFFont;
  bold: PDFFont;
}

export interface TextStyle {
  weight?: keyof Fonts;
  size?: number;
  color?: Color;
  /** Line height as a multiple of the size. */
  leading?: number;
}

const resolve = (style: TextStyle) => ({
  weight: style.weight ?? "regular",
  size: style.size ?? TYPE.body,
  color: style.color ?? COLOR.ink,
  leading: style.leading ?? TYPE.leading,
});

/**
 * A minimal flow layout on top of pdf-lib: a cursor (`y`, top-down), word wrapping, page breaks
 * and a log of every string drawn (tests read it, since the embedded font hides the text).
 */
export class Canvas {
  page!: PDFPage;
  /** Baseline cursor, in PDF points from the bottom of the page. */
  y = 0;
  readonly log: string[] = [];
  private readonly charsets: Record<keyof Fonts, Set<number>>;

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
    /** Draws the running header of a follow-up page and returns where content starts. */
    private readonly onNewPage: (canvas: Canvas) => number,
  ) {
    this.charsets = {
      regular: new Set(fonts.regular.getCharacterSet()),
      medium: new Set(fonts.medium.getCharacterSet()),
      bold: new Set(fonts.bold.getCharacterSet()),
    };
  }

  addPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = this.onNewPage(this);
  }

  /** Starts a new page unless `height` still fits above the footer. */
  ensure(height: number): void {
    if (this.y - height < PAGE.bottom) this.addPage();
  }

  /**
   * Replaces characters the subset font lacks: first by their base letter (Ș → S), else "?".
   * Names come from user input, so anything can arrive here.
   */
  clean(text: string, weight: keyof Fonts = "regular"): string {
    const charset = this.charsets[weight];
    let out = "";
    for (const char of text.normalize("NFC")) {
      const code = char.codePointAt(0) ?? 0;
      if (charset.has(code)) out += char;
      else if (char === "­") continue;
      else {
        const base = char.normalize("NFD").replace(/\p{M}/gu, "");
        out += base && [...base].every((c) => charset.has(c.codePointAt(0) ?? 0)) ? base : "?";
      }
    }
    return out;
  }

  width(text: string, style: TextStyle = {}): number {
    const s = resolve(style);
    return this.fonts[s.weight].widthOfTextAtSize(this.clean(text, s.weight), s.size);
  }

  lineHeight(style: TextStyle = {}): number {
    const s = resolve(style);
    return s.size * s.leading;
  }

  /** Wraps paragraphs (split on "\n") to `maxWidth`; overlong words break by character. */
  wrap(text: string, maxWidth: number, style: TextStyle = {}): string[] {
    const s = resolve(style);
    const font = this.fonts[s.weight];
    const measure = (t: string) => font.widthOfTextAtSize(t, s.size);
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of this.clean(paragraph, s.weight)
        .split(/[ \t]+/)
        .filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = word;
        while (measure(line) > maxWidth) {
          let cut = line.length - 1;
          while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Height of `text` wrapped to `maxWidth`. */
  measure(text: string, maxWidth: number, style: TextStyle = {}): number {
    return this.wrap(text, maxWidth, style).length * this.lineHeight(style);
  }

  /** One line at an absolute baseline; `align` right puts the text's end at `x`. */
  line(
    text: string,
    x: number,
    y: number,
    style: TextStyle = {},
    align: "left" | "right" = "left",
  ) {
    const s = resolve(style);
    const clean = this.clean(text, s.weight);
    const font = this.fonts[s.weight];
    const left = align === "right" ? x - font.widthOfTextAtSize(clean, s.size) : x;
    this.page.drawText(clean, { x: left, y, size: s.size, font, color: s.color });
    this.log.push(clean);
  }

  /**
   * Wrapped text starting at the cursor's top edge; moves the cursor below it. Breaks the page
   * between lines when needed. Returns the height used.
   */
  text(text: string, x: number, maxWidth: number, style: TextStyle = {}): number {
    const s = resolve(style);
    const lh = this.lineHeight(style);
    let used = 0;
    for (const line of this.wrap(text, maxWidth, style)) {
      this.ensure(lh);
      // Baseline sits about 0.78 of the size below the line's top (cap height plus half leading).
      this.line(line, x, this.y - (lh + s.size * 0.7) / 2, style);
      this.y -= lh;
      used += lh;
    }
    return used;
  }

  /** Text that must not move the cursor (e.g. a label column next to a value column). */
  textAt(text: string, x: number, top: number, maxWidth: number, style: TextStyle = {}): number {
    const saved = this.y;
    this.y = top;
    const used = this.text(text, x, maxWidth, style);
    this.y = saved;
    return used;
  }

  rect(x: number, top: number, width: number, height: number, color: Color): void {
    this.page.drawRectangle({ x, y: top - height, width, height, color });
  }

  /** A filled rectangle with rounded corners (top-left at x/top). */
  roundedRect(x: number, top: number, width: number, height: number, r: number, color: Color) {
    const w = width;
    const h = height;
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(path, { x, y: top, color, borderWidth: 0 });
  }

  hairline(x: number, y: number, width: number, color: Color = COLOR.line, thickness = 0.6) {
    this.page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness,
      color,
    });
  }

  /** The dotted rule of Pax documents: a row of small squares. */
  squareRule(x: number, y: number, width: number, color: Color = COLOR.lineStrong): void {
    const size = 1.8;
    const step = 3.6;
    for (let dx = 0; dx + size <= width; dx += step) {
      this.page.drawRectangle({ x: x + dx, y, width: size, height: size, color });
    }
  }
}
