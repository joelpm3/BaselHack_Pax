import { audit } from "@/lib/audit";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { toIsoDate } from "@/lib/documents/dates";
import { exportCustomerData } from "@/lib/privacy/service";

/** "Meine Daten herunterladen": everything stored about the signed-in customer as JSON. */
export async function GET() {
  const customer = await getCurrentCustomer();
  const data = customer ? exportCustomerData(customer.id) : null;
  if (!customer || !data) return Response.json({ error: "unauthorized" }, { status: 401 });
  audit({
    actorType: "customer",
    actorId: customer.id,
    action: "customer.data_exported",
    entityType: "customer",
    entityId: customer.id,
  });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pax-meine-daten-${toIsoDate(new Date())}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
