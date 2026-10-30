import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
