import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Brand assets for the PDFs, read once per server process.
 *
 * The fonts are Latin subsets of the app's Pax Civil (src/fonts/*.woff2) as plain TrueType
 * without layout tables: pdf-lib can neither read WOFF2 nor subset or shape these fonts
 * correctly (missing glyphs, broken "ff" ligature spacing). The font allows embedding
 * (OS/2 fsType 8, editable embedding). Regenerate with scripts/subset-pdf-fonts.py.
 */
const root = process.cwd();

export const ASSETS = {
  regular: readFileSync(path.join(root, "src/fonts/pdf/PaxCivil-Regular.ttf")),
  medium: readFileSync(path.join(root, "src/fonts/pdf/PaxCivil-Medium.ttf")),
  bold: readFileSync(path.join(root, "src/fonts/pdf/PaxCivil-Bold.ttf")),
  logoPositive: readFileSync(path.join(root, "public/brand/pax-logo-positive.png")),
  logoNegative: readFileSync(path.join(root, "public/brand/pax-logo-negative.png")),
};
