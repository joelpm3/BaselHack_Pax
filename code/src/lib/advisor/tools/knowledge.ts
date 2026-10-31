import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { PRODUCT_CODES, PRODUCTS } from "@/lib/domain/products";
import { lookupKnowledge, productsWithKnowledge } from "@/lib/knowledge/service";
import type { ToolContext } from "./context";

export interface ProductInfoOutput {
  status: "ok" | "no_documents" | "no_match";
  product: string;
  /** Document versions that were searched ("title v2"); the audit trail stores the same. */
  sources: string[];
  excerpts: Array<{ source: string; heading: string; page: number | null; text: string }>;
  /** Section headings to retry with other words after `no_match`. */
  headings?: string[];
}

/**
 * Product details (waiting periods, exclusions, surrender values, age limits, tariff notes)
 * from the documents Pax uploads in /firma/wissen. Each lookup is written to the audit trail
 * with the exact document versions, so a reply can be traced to the text it was based on.
 */
export function createKnowledgeTools(ctx: ToolContext) {
  const available = productsWithKnowledge();
  const listed = available.length
    ? available
        .map((p) => `${PRODUCTS[p.productCode].name} (${p.productCode}): ${p.titles.join(", ")}`)
        .join("; ")
    : "none yet";

  return {
    lookupProductInfo: tool({
      description:
        "Look up details of a Pax product in the official product documents Pax uploaded " +
        "(product sheet, general terms / AVB, tariff information): benefits, waiting periods, " +
        "exclusions, premium payment, surrender, age limits, conditions. Use it before stating " +
        "any product detail you are not certain of; quote what it returns and name the document. " +
        `Documents available: ${listed}.`,
      inputSchema: z.object({
        productCode: z.enum(PRODUCT_CODES),
        question: z
          .string()
          .min(2)
          .max(300)
          .describe(
            "Keywords in German as the document would phrase them, e.g. 'Wartefrist Erwerbsunfähigkeit'",
          ),
      }),
      execute: async ({ productCode, question }): Promise<ProductInfoOutput> => {
        const result = lookupKnowledge(productCode, question);
        const label = (s: { title: string; version: number }) => `${s.title} v${s.version}`;
        const status =
          result.documents.length === 0
            ? "no_documents"
            : result.excerpts.length
              ? "ok"
              : "no_match";
        audit({
          actorType: "ai",
          action: "knowledge.lookup",
          entityType: "conversation",
          entityId: ctx.conversationId,
          data: {
            productCode,
            question,
            status,
            used: result.excerpts.map((e) => ({
              documentId: e.source.documentId,
              title: e.source.title,
              version: e.source.version,
              heading: e.heading,
            })),
            searched: result.documents.map((d) => ({
              documentId: d.documentId,
              version: d.version,
            })),
          },
        });
        return {
          status,
          product: PRODUCTS[productCode].name,
          sources: result.documents.map(label),
          excerpts: result.excerpts.map((e) => ({
            source: label(e.source),
            heading: e.heading,
            page: e.page,
            text: e.text,
          })),
          ...(status === "no_match" ? { headings: result.headings } : {}),
        };
      },
    }),
  };
}
