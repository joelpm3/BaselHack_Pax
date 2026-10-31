import { after } from "next/server";
import { z } from "zod";
import { getCurrentAdvisor } from "@/lib/auth/advisor";
import { KNOWLEDGE_KINDS } from "@/lib/domain/learning";
import { PRODUCT_CODES } from "@/lib/domain/products";
import { processKnowledgeDocument, storeKnowledgeUpload } from "@/lib/knowledge/service";

const newEntry = z.object({
  productCode: z.enum(PRODUCT_CODES),
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().trim().min(2).max(120),
});
const replacement = z.object({ entryId: z.uuid() });

/**
 * Upload of a product document (multipart: `file` plus either `productCode`, `kind`, `title`
 * for a new document or `entryId` to replace one). Stored encrypted; reading it into sections
 * runs in the background and activates the version when done.
 */
export async function POST(request: Request) {
  const advisor = await getCurrentAdvisor();
  if (!advisor) return Response.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no_file" }, { status: 400 });

  const fields = Object.fromEntries(
    [...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const replace = replacement.safeParse(fields);
  const create = newEntry.safeParse(fields);
  const target = replace.success
    ? { type: "replace" as const, entryId: replace.data.entryId }
    : create.success
      ? { type: "new" as const, ...create.data }
      : null;
  if (!target) return Response.json({ error: "invalid_fields" }, { status: 400 });

  const result = await storeKnowledgeUpload({ file, advisorId: advisor.id, target });
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  after(() => processKnowledgeDocument(result.id));
  return Response.json({ id: result.id }, { status: 201 });
}
