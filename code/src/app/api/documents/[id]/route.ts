import { getCurrentAdvisor } from "@/lib/auth/advisor";
import { getCurrentCustomer } from "@/lib/auth/customer";
import {
  deleteDocument,
  getDocument,
  getExtractionSummary,
  getOwnedDocument,
} from "@/lib/documents/service";

/** Extraction summary of one document, for its owner or a Pax advisor. */
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const [customer, advisor] = await Promise.all([getCurrentCustomer(), getCurrentAdvisor()]);
  const doc = getDocument(id);
  const allowed = doc && (advisor || (customer && doc.customerId === customer.id));
  if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(getExtractionSummary(id));
}

/** The owner deletes the document: the encrypted file is removed. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const customer = await getCurrentCustomer();
  if (!customer || !getOwnedDocument(customer.id, id))
    return Response.json({ error: "not_found" }, { status: 404 });
  await deleteDocument(customer.id, id, "deleted");
  return new Response(null, { status: 204 });
}
