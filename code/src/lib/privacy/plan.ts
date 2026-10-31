/**
 * What "Meine Daten löschen" removes. Everything the advisor collected or produced goes;
 * Pax contracts (Pax policies and signed applications) stay because retention law requires
 * them. A customer without any contract is removed completely.
 */

export interface ErasurePolicy {
  id: string;
  isExternal: boolean;
}

export interface ErasureApplication {
  id: string;
  status: "draft" | "signed" | "cancelled";
  policyId: string | null;
}

export type ErasureScope = "full" | "agentic";

export interface ErasurePlan {
  scope: ErasureScope;
  keepPolicyIds: string[];
  keepApplicationIds: string[];
}

export function erasurePlan(
  policies: ErasurePolicy[],
  applications: ErasureApplication[],
): ErasurePlan {
  const keptApplications = applications.filter((a) => a.status === "signed");
  const keepPolicyIds = new Set(policies.filter((p) => !p.isExternal).map((p) => p.id));
  const known = new Set(policies.map((p) => p.id));
  for (const application of keptApplications) {
    if (application.policyId && known.has(application.policyId))
      keepPolicyIds.add(application.policyId);
  }
  const keepApplicationIds = keptApplications.map((a) => a.id);
  return {
    scope: keepPolicyIds.size === 0 && keepApplicationIds.length === 0 ? "full" : "agentic",
    keepPolicyIds: [...keepPolicyIds],
    keepApplicationIds,
  };
}
