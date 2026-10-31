import { getConversation } from "@/lib/advisor/conversations";
import { buildVorsorgebild } from "@/lib/advisor/picture";
import { refreshPictureCalculations } from "@/lib/advisor/picture-refresh";
import { getCurrentCustomer } from "@/lib/auth/customer";

/**
 * The current Vorsorgebild of the conversation's customer (refreshed after every turn). Runs
 * the retirement and risk check first when all inputs are known but the result is outdated.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/chat/[id]/vorsorgebild">) {
  const { id } = await ctx.params;
  const customer = await getCurrentCustomer();
  const conversation = getConversation(id);
  if (!customer || conversation?.customerId !== customer.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  await refreshPictureCalculations(customer.id, conversation.id);
  return Response.json(buildVorsorgebild(customer.id), {
    headers: { "Cache-Control": "no-store" },
  });
}
