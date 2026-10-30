import "server-only";
import { tool } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { extractDocument } from "@/lib/documents";
import type { ExtractionSummary } from "@/lib/documents/types";
import type { DocumentUploadPromptOutput } from "../types";
import type { ToolContext } from "./context";

const uploadableTypes = z.enum(["pension_certificate", "insurance_policy", "salary_certificate"]);

export function createDocumentTools(ctx: ToolContext) {
  return {
    suggestDocumentUpload: tool({
      description:
        "Offer the document shortcut: the customer can upload their pension certificate " +
        "(Vorsorgeausweis), insurance policies or salary certificate (Lohnausweis) instead of " +
        "answering number questions. Shows an upload card with a skip option. Only after you know " +
        "who you are talking to; at most once unless they ask again.",
      inputSchema: z.object({
        documentTypes: z
          .array(uploadableTypes)
          .min(1)
          .max(3)
          .describe("The documents that would help most, most useful first"),
      }),
      execute: async ({ documentTypes }): Promise<DocumentUploadPromptOutput> => ({
        documentTypes,
      }),
    }),

    reviewDocuments: tool({
      description:
        "Read uploaded documents (ids from the customer's upload message) and show the customer " +
        "what was extracted, so they can correct and confirm it. Values only count once confirmed.",
      inputSchema: z.object({ documentIds: z.array(z.string().min(1)).min(1).max(10) }),
      execute: async ({ documentIds }): Promise<{ extractions: ExtractionSummary[] }> => {
        const owned = db
          .select({ id: schema.documents.id })
          .from(schema.documents)
          .where(
            and(
              inArray(schema.documents.id, documentIds),
              eq(schema.documents.customerId, ctx.customerId),
            ),
          )
          .all();
        if (owned.length === 0) throw new Error("No uploaded documents found for these ids.");
        const extractions = await Promise.all(owned.map((d) => extractDocument(d.id)));
        return { extractions };
      },
    }),
  };
}
