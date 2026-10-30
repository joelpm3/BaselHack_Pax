/** ISO date (yyyy-mm-dd) arithmetic in UTC, free of time zones and wall clocks. */

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** Adds (or subtracts) months, clamping to the last day of the target month. */
export function addMonths(iso: string, months: number): string {
  const d = fromIso(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(d);
}

export function daysBetween(fromIsoDate: string, toIsoDateValue: string): number {
  return Math.round(
    (fromIso(toIsoDateValue).getTime() - fromIso(fromIsoDate).getTime()) / 86_400_000,
  );
}

export function yearOf(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const year = Number(iso.slice(0, 4));
  return Number.isInteger(year) ? year : undefined;
}

/** Swiss display format dd.mm.yyyy, independent of the UI locale. */
export function formatSwissDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}
