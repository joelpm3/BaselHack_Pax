import { audit } from "@/lib/audit";
import { getCurrentAdvisor } from "@/lib/auth/advisor";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { renderContractPdf } from "@/lib/contracts/render";
import { getPolicy, loadContractDocument } from "@/lib/contracts/service";
import { CONTRACT_DOCUMENTS, type ContractDocumentKind } from "@/lib/contracts/types";

const isKind = (kind: string): kind is ContractDocumentKind =>
  (CONTRACT_DOCUMENTS as readonly string[]).includes(kind);

/**
 * The Antrag (`offer`) or the Police (`policy`) of a Pax policy as PDF, in the customer's
 * language. Only for the owning customer (device cookie) and signed-in Pax advisors; every
 * download is written to the audit log.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/policies/[id]/[kind]">) {
  const { id, kind } = await ctx.params;
  if (!isKind(kind)) return new Response("Not found", { status: 404 });
  const [customer, advisor] = await Promise.all([getCurrentCustomer(), getCurrentAdvisor()]);
  const policy = getPolicy(id);
  if (!policy) return new Response("Not found", { status: 404 });

  const viewer =
    customer?.id === policy.customerId
      ? { actorType: "customer" as const, actorId: customer.id }
      : advisor
        ? { actorType: "advisor" as const, actorId: advisor.id }
        : null;
  // Same answer for "not yours" and "does not exist": policy ids are not enumerable.
  if (!viewer) return new Response("Not found", { status: 404 });

  const doc = loadContractDocument(policy, kind);
  if (!doc) return new Response("Not available", { status: 404 });
  const pdf = await renderContractPdf(doc);
  audit({
    ...viewer,
    action: "contract.pdf_downloaded",
    entityType: "policy",
    entityId: policy.id,
    data: { kind, locale: doc.locale, policyNumber: doc.policyNumber, status: policy.status },
  });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.bytes.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
