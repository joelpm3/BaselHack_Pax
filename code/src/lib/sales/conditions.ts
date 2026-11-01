import type { ProductCode } from "@/lib/domain/products";

const UNIT_LINKED = new Set<ProductCode>(["lifestar", "fondsstar", "auszahlungsplan"]);

/** The "Wichtige Bedingungen" of an offer (keys of `sales.offer.conditions`). */
export function offerConditionKeys(productCode: ProductCode, pillar: "3a" | "3b" | null): string[] {
  return [
    "withdrawal",
    UNIT_LINKED.has(productCode) ? "investmentRisk" : "premiumGuaranteed",
    ...(productCode === "erwerbsunfaehigkeit" ? ["maximumBenefit", "crisisCoach"] : []),
    ...(pillar === "3a" ? ["pillar3a"] : []),
    "health",
    "cooperative",
  ];
}
