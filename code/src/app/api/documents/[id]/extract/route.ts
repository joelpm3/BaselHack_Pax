import { getCurrentCustomer } from "@/lib/auth/customer";
import { extractDocument, getOwnedDocument } from "@/lib/documents/service";

/** Runs (or joins, or returns) the extraction of the owner's document and returns the summary. */
export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/extract">) {
  const { id } = await ctx.params;
  const customer = await getCurrentCustomer();
  if (!customer || !getOwnedDocument(customer.id, id))
    return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(await extractDocument(id));
}
