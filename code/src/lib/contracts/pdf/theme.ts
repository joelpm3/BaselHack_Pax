import { type RGB, rgb } from "pdf-lib";

/**
 * The app's design tokens (src/app/globals.css) for PDF output. pdf.test.ts checks every value
 * against globals.css, so the documents stay in step with the app.
 */
export const TOKENS = {
  "pax-green": "#8ccd0f",
  "pax-purple": "#3c0078",
  "deep-purple": "#2a0754",
  "contrast-green": "#5ca700",
  "light-green": "#e3f2c5",
  "light-purple": "#e7e1ee",
  "aura-purple": "#500099",
  ink: "#121212",
  "gray-2": "#ededed",
  "gray-3": "#d4d4d4",
  "gray-5": "#8e8e8e",
  "gray-6": "#6a6a6a",
  "accent-yellow": "#fae614",
} as const;

function hex(value: string): RGB {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export const COLOR = {
  green: hex(TOKENS["pax-green"]),
  purple: hex(TOKENS["pax-purple"]),
  deepPurple: hex(TOKENS["deep-purple"]),
  contrastGreen: hex(TOKENS["contrast-green"]),
  lightGreen: hex(TOKENS["light-green"]),
  lightPurple: hex(TOKENS["light-purple"]),
  auraPurple: hex(TOKENS["aura-purple"]),
  ink: hex(TOKENS.ink),
  line: hex(TOKENS["gray-2"]),
  lineStrong: hex(TOKENS["gray-3"]),
  subtle: hex(TOKENS["gray-5"]),
  muted: hex(TOKENS["gray-6"]),
  yellow: hex(TOKENS["accent-yellow"]),
  white: rgb(1, 1, 1),
  /** White text on Pax Purple at a lower emphasis (rgba(255,255,255,.72) flattened). */
  onPurpleMuted: rgb(0.8, 0.72, 0.87),
} as const;

/** A4 in points, Pax letter margins, and the label/value grid of Pax offers. */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 56,
  top: 64,
  bottom: 92,
  labelWidth: 132,
  gutter: 16,
} as const;

export const CONTENT_WIDTH = PAGE.width - 2 * PAGE.marginX;
export const VALUE_X = PAGE.marginX + PAGE.labelWidth + PAGE.gutter;
export const VALUE_WIDTH = PAGE.width - PAGE.marginX - VALUE_X;

/** Type scale in points (body 9.5 / 14.5 leading, about 70 characters per value line). */
export const TYPE = {
  title: 30,
  subtitle: 14,
  heading: 13,
  body: 9.5,
  small: 8,
  tiny: 7,
  amount: 22,
  leading: 1.5,
} as const;

/** Radii from the tokens: --radius-m (controls, panels) and full pills for badges. */
export const RADIUS = { m: 7.5 } as const;
