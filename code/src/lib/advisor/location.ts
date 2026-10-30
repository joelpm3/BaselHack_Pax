import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";
import type { CallContext } from "@/lib/logismata/client";
import { applyProfileChanges } from "@/lib/profile/service";
import { resolveTaxLocation } from "./logismata/checks";

/**
 * Tax calculations need a Logismata tax location. Profiles from documents or the CRM often have
 * only a postcode or town: resolve it once and store it, so nobody is asked for it again.
 */
export async function ensureTaxLocation(
  customerId: string,
  profile: LifeSituation,
  locale: Locale,
  ctx: CallContext,
): Promise<LifeSituation> {
  const { residence } = profile;
  if (residence.taxLocationId !== undefined || (!residence.zip && !residence.city)) return profile;
  const location = await resolveTaxLocation(residence, locale, ctx).catch(() => null);
  if (!location) return profile;
  return applyProfileChanges(
    customerId,
    [
      { path: "residence.zip", value: location.zip },
      { path: "residence.city", value: location.city },
      { path: "residence.canton", value: location.canton },
      { path: "residence.taxLocationId", value: location.taxLocationId },
    ],
    { source: "chat", conversationId: ctx.conversationId },
  );
}
