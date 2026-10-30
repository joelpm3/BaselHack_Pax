import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the Pax type scale (globals.css `--text-*`): otherwise it reads
 * `text-paragraph-xs` as a colour and drops `text-white` (or the size) when both are present.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "heading-xl",
        "heading-l",
        "heading-m",
        "heading-s",
        "paragraph-l",
        "paragraph-m",
        "paragraph-s",
        "paragraph-xs",
        "display-m",
        "display-l",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * CHF amounts in Swiss notation (CHF 12'345, CHF 1'425.60) in every language, as on Pax
 * documents. Formatted by hand on purpose: Intl output differs between Node's and the browser's
 * ICU data (fr-CH "500'000 CHF" vs "500 000 CHF"), which breaks hydration.
 */
export function formatChf(amount: number, _locale = "de", fractionDigits = 0): string {
  const [whole, fraction] = Math.abs(amount).toFixed(fractionDigits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const sign = amount < 0 && Number(whole + (fraction ?? "")) !== 0 ? "−" : "";
  return `CHF ${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
}
