import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";
import { findPlace, normalizeName, type Place, parseZip } from "@/lib/locality";
import type { CallContext } from "@/lib/logismata/client";
import { applyProfileChanges, type ProfileChange } from "@/lib/profile/service";
import { searchLocations } from "./logismata/checks";
import type { PlaceOption, ResidencePlace } from "./types";

export type ResidenceResolution =
  | { status: "resolved"; location: ResidencePlace; changes: ProfileChange[] }
  /** Several places fit: the customer picks one, nobody guesses. */
  | { status: "ambiguous"; options: PlaceOption[] }
  | { status: "unknown" };

type Residence = LifeSituation["residence"];

/**
 * Turns what the customer said ("8165", "Wil", "8165 Schleinikon") into a place of residence.
 * Which town a postcode means comes from the official locality directory (`@/lib/locality`);
 * Logismata only supplies the tax location id for that town, and is the fallback for names the
 * directory does not know (exonyms such as "Genf"), accepted only when it names one town.
 */
export async function resolveResidence(
  query: { zip?: string; city?: string },
  current: Residence,
  locale: Locale,
  ctx: CallContext,
): Promise<ResidenceResolution> {
  const match = findPlace(query);
  if (match.status === "ambiguous") {
    return {
      status: "ambiguous",
      options: match.options.map(({ zip, town, canton }) => ({ zip, town, canton })),
    };
  }
  if (match.status === "match") {
    const taxLocationId = await taxLocationIdFor(match.place, locale, ctx);
    const { zip, town, canton } = match.place;
    return resolved({ zip, city: town, canton, taxLocationId }, current);
  }
  const fallback = await logismataPlace(query, locale, ctx);
  return fallback ? resolved(fallback, current) : { status: "unknown" };
}

function resolved(location: ResidencePlace, current: Residence): ResidenceResolution {
  const changes: ProfileChange[] = [];
  // A town with several postcodes clears an older postcode instead of keeping a wrong one.
  if (location.zip || current.zip)
    changes.push({ path: "residence.zip", value: location.zip ?? undefined });
  changes.push(
    { path: "residence.city", value: location.city },
    { path: "residence.canton", value: location.canton },
  );
  if (location.taxLocationId !== null || current.taxLocationId !== undefined) {
    changes.push({ path: "residence.taxLocationId", value: location.taxLocationId ?? undefined });
  }
  return { status: "resolved", location, changes };
}

/** The Logismata tax location of exactly this town (never just the first search hit). */
async function taxLocationIdFor(place: Place, locale: Locale, ctx: CallContext) {
  const text = [place.zip, place.town].filter(Boolean).join(" ");
  const rows = await searchLocations(text, locale, ctx).catch(() => []);
  const town = normalizeName(place.town);
  const exact = rows.find(
    (r) => (!place.zip || r.ZipCode === place.zip) && r.City && normalizeName(r.City) === town,
  );
  // Logismata may spell the town in the customer's language ("Bâle"): the postcode still decides
  // when the directory says it covers only this one place.
  const byZip =
    place.zip && findPlace({ zip: place.zip }).status === "match"
      ? rows.find((r) => r.ZipCode === place.zip)
      : undefined;
  return (exact ?? byZip)?.LocationID ?? null;
}

async function logismataPlace(
  query: { zip?: string; city?: string },
  locale: Locale,
  ctx: CallContext,
): Promise<ResidencePlace | null> {
  const zip = parseZip(query.zip);
  const text = [zip, query.city?.trim()].filter(Boolean).join(" ");
  if (!text) return null;
  const rows = (await searchLocations(text, locale, ctx).catch(() => [])).filter(
    (r) => r.LocationID && r.City && r.Canton && (!zip || r.ZipCode === zip),
  );
  const towns = new Set(rows.map((r) => `${normalizeName(r.City ?? "")}|${r.Canton}`));
  if (towns.size !== 1) return null;
  const [row] = rows;
  return {
    zip,
    city: row.City ?? "",
    canton: row.Canton ?? "",
    taxLocationId: row.LocationID ?? null,
  };
}

/**
 * Tax calculations need a Logismata tax location. Profiles from documents or the CRM often have
 * only a postcode or town: resolve it once and store it, so nobody is asked for it again. An
 * ambiguous postcode stays unresolved; the tax check then asks which place it is.
 */
export async function ensureTaxLocation(
  customerId: string,
  profile: LifeSituation,
  locale: Locale,
  ctx: CallContext,
): Promise<LifeSituation> {
  const { residence } = profile;
  if (residence.taxLocationId !== undefined || (!residence.zip && !residence.city)) return profile;
  const result = await resolveResidence(residence, residence, locale, ctx);
  if (result.status !== "resolved" || result.location.taxLocationId === null) return profile;
  return applyProfileChanges(customerId, result.changes, {
    source: "chat",
    conversationId: ctx.conversationId,
  });
}
