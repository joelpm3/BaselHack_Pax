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

const chfFormatters = new Map<string, Intl.NumberFormat>();

/** CHF amounts in Swiss notation (CHF 12'345). */
export function formatChf(amount: number, locale = "de", fractionDigits = 0): string {
  const key = `${locale}:${fractionDigits}`;
  let formatter = chfFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(`${locale}-CH`, {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    chfFormatters.set(key, formatter);
  }
  return formatter.format(amount);
}
