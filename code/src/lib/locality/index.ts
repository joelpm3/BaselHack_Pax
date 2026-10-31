import rows from "./localities.json";

/**
 * Swiss postcode ↔ locality lookup from the official directory of localities (swisstopo
 * "Amtliches Ortschaftenverzeichnis", bundled; regenerate with scripts/generate-localities.ts).
 * Deterministic on purpose: which town a postcode means is never left to the model.
 * Server-side only (the data is ~200 KB); not marked server-only so Vitest can import it.
 */

export interface Locality {
  zip: string;
  /** Official locality name, as on a letter ("Schöfflisdorf", "Wil SG"). */
  town: string;
  canton: string;
  /** BFS number of the municipality the locality (mostly) belongs to. */
  bfsNumber: number;
  municipality: string;
}

/** One place of residence; `zip` is null when the town has several postcodes (Zürich). */
export interface Place {
  zip: string | null;
  town: string;
  canton: string;
  bfsNumber: number;
}

export type PlaceMatch =
  | { status: "match"; place: Place }
  | { status: "ambiguous"; options: Place[] }
  /** Many places fit (e.g. a very common name): ask for the postcode instead. */
  | { status: "too_many" }
  | { status: "unknown" };

/** More candidates than this are no longer a sensible pick list. */
export const MAX_OPTIONS = 8;

const LOCALITIES: Locality[] = (rows as [string, string, string, number, string][]).map(
  ([zip, town, canton, bfsNumber, municipality]) => ({
    zip,
    town,
    canton,
    bfsNumber,
    municipality,
  }),
);

const CANTON_SUFFIX = new Set(
  "AG AI AR BE BL BS FR GE GL GR JU LU NE NW OW SG SH SO SZ TG TI UR VD VS ZG ZH".split(" "),
);

/**
 * Case, accents, umlaut spellings and punctuation do not matter:
 * "st.gallen" = "St. Gallen", "Zurich" = "Zuerich" = "Zürich".
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/([aou])e/g, "$1")
    .replace(/\bsankt\b/g, "st")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Wil SG" → "wil", "Wiler (Lötschen)" → "wiler", "Lausanne 25" → "lausanne". */
function baseName(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, " ")
    .trim()
    .split(/\s+/);
  while (words.length > 1) {
    const last = words[words.length - 1];
    if (CANTON_SUFFIX.has(last) || /^\d+$/.test(last)) words.pop();
    else break;
  }
  return normalizeName(words.join(" "));
}

const byZip = new Map<string, Locality[]>();
for (const locality of LOCALITIES) {
  const list = byZip.get(locality.zip);
  if (list) list.push(locality);
  else byZip.set(locality.zip, [locality]);
}

/** "8165", "CH-8165", " 8165 " → "8165"; anything else → null. */
export function parseZip(input: string | undefined): string | null {
  const match = input?.trim().match(/^(?:CH-?)?\s*(\d{4})$/i);
  return match ? match[1] : null;
}

export function localitiesByZip(zip: string): Locality[] {
  const parsed = parseZip(zip);
  return parsed ? (byZip.get(parsed) ?? []) : [];
}

function townMatches(locality: Locality, query: string): boolean {
  return normalizeName(locality.town) === query || baseName(locality.town) === query;
}

/** Localities called like `name`; if none, the localities of a municipality called like it. */
export function localitiesByTown(name: string): Locality[] {
  const query = normalizeName(name);
  if (!query) return [];
  const towns = LOCALITIES.filter((l) => townMatches(l, query));
  if (towns.length > 0) return towns;
  return LOCALITIES.filter(
    (l) => normalizeName(l.municipality) === query || baseName(l.municipality) === query,
  );
}

/**
 * Localities that differ only by a number (PO-box towns "Lausanne 25/26") or by postcode
 * (Zürich 8001…8099) are one place to live; everything else is a separate choice.
 */
function toPlaces(candidates: Locality[]): Place[] {
  const groups = new Map<string, Locality[]>();
  for (const locality of candidates) {
    const key = `${baseName(locality.town)}|${locality.bfsNumber}`;
    groups.set(key, [...(groups.get(key) ?? []), locality]);
  }
  return [...groups.values()].map((group) => {
    const zips = new Set(group.map((l) => l.zip));
    const [first] = group;
    const base = baseName(first.town);
    const town =
      group.find((l) => normalizeName(l.town) === base)?.town ??
      (baseName(first.municipality) === base && group.length > 1 ? first.municipality : first.town);
    return {
      zip: zips.size === 1 ? first.zip : null,
      town,
      canton: first.canton,
      bfsNumber: first.bfsNumber,
    };
  });
}

/**
 * Resolves what the customer said ("8165", "Wil", "8165 Schleinikon") to one place, or to the
 * places they have to choose from. A town that contradicts the postcode does not narrow it.
 */
export function findPlace(query: { zip?: string; city?: string }): PlaceMatch {
  const zip = parseZip(query.zip);
  const city = query.city?.trim() ? normalizeName(query.city) : "";
  let candidates: Locality[] = [];
  if (zip) {
    candidates = byZip.get(zip) ?? [];
    const narrowed = city ? candidates.filter((l) => townMatches(l, city)) : [];
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length === 0 && query.city) candidates = localitiesByTown(query.city);
  const places = toPlaces(candidates);
  if (places.length === 0) return { status: "unknown" };
  if (places.length === 1) return { status: "match", place: places[0] };
  if (places.length > MAX_OPTIONS) return { status: "too_many" };
  return {
    status: "ambiguous",
    options: places.sort(
      (a, b) => (a.zip ?? "").localeCompare(b.zip ?? "") || a.town.localeCompare(b.town, "de"),
    ),
  };
}
