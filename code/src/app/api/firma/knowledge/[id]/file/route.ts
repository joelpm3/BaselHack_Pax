import { getCurrentAdvisor } from "@/lib/auth/advisor";
import { readDecrypted } from "@/lib/documents/storage";
import { getKnowledgeDocument } from "@/lib/knowledge/service";

/** Decrypts and streams the original product document, for signed-in advisors only. */
export async function GET(_request: Request, ctx: RouteContext<"/api/firma/knowledge/[id]/file">) {
  const advisor = await getCurrentAdvisor();
  if (!advisor) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const doc = getKnowledgeDocument(id);
  if (!doc || doc.status === "deleted") return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readDecrypted(doc.storagePath, doc.id);
  } catch (error) {
    console.error(`[knowledge] cannot decrypt ${doc.id}:`, (error as Error).message);
    return new Response("Document unavailable", { status: 410 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      // Seeded product pages from pax.ch are Markdown; uploads are always PDF.
      "Content-Type": doc.filename.endsWith(".md")
        ? "text/markdown; charset=utf-8"
        : "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
