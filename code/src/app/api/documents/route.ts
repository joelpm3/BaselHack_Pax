import { after } from "next/server";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { extractDocument, listCustomerDocuments, storeUploads } from "@/lib/documents/service";

const MAX_FILES_PER_REQUEST = 10;

/**
 * Upload (multipart: `files` (1..10), optional `conversationId`). Files are validated, stored
 * encrypted and extraction starts in the background, so it is usually done by the time the
 * advisor asks for it.
 */
export async function POST(request: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) return Response.json({ error: "no_files" }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST)
    return Response.json({ error: "too_many_files" }, { status: 400 });
  const conversationId = form.get("conversationId");

  const { response, created } = await storeUploads({
    customerId: customer.id,
    conversationId: typeof conversationId === "string" && conversationId ? conversationId : null,
    files,
  });
  if (created.length > 0) after(() => Promise.all(created.map((id) => extractDocument(id))));
  return Response.json(response, { status: response.documents.length > 0 ? 201 : 422 });
}

/** The current customer's documents (without extracted values). */
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "unauthorized" }, { status: 401 });
  const documents = listCustomerDocuments(customer.id).map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    pageCount: doc.pageCount,
    docType: doc.docType,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  }));
  return Response.json({ documents });
}
