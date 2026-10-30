import { getCurrentAdvisor } from "@/lib/auth/advisor";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { getDocument, readDocumentFile } from "@/lib/documents/service";

/**
 * Decrypts and streams the original. Allowed for the owning customer (device cookie) and for
 * signed-in Pax advisors; every view is written to the audit log.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const [customer, advisor] = await Promise.all([getCurrentCustomer(), getCurrentAdvisor()]);
  const doc = getDocument(id);
  if (!doc || doc.status === "deleted") return new Response("Not found", { status: 404 });

  const isOwner = customer?.id === doc.customerId;
  const viewer = isOwner
    ? { actorType: "customer" as const, actorId: doc.customerId }
    : advisor
      ? { actorType: "advisor" as const, actorId: advisor.id }
      : null;
  if (!viewer) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readDocumentFile(doc, viewer);
  } catch (error) {
    console.error(`[documents] cannot decrypt ${doc.id}:`, (error as Error).message);
    return new Response("Document unavailable", { status: 410 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "Cache-Control": "private, no-store",
      // The type was verified from the file's magic bytes at upload (PDF or image only).
      "X-Content-Type-Options": "nosniff",
    },
  });
}
