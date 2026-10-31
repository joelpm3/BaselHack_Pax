import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, modelName } from "@/lib/ai/models";
import type { KnowledgeSection } from "@/lib/domain/learning";

/**
 * Turns a product PDF into plain-text sections with the same model that reads customer
 * documents (it reads PDFs natively, so no PDF text library is needed). The text is copied, not
 * summarised: the advisor quotes from it, so every figure must stay exactly as printed.
 */

const TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 32_000;

const sectionsSchema = z.object({
  sections: z.array(
    z.object({
      heading: z.string().describe("The section heading as printed (or a short label if none)"),
      page: z.number().describe("1-based page where the section starts"),
      text: z.string().describe("The full section text, verbatim"),
    }),
  ),
});

const INSTRUCTIONS = `You transcribe Swiss insurance product documents (product sheets, general terms and conditions / AVB, tariff information) into sections so an advisor can look up details.
Rules:
- Copy the text verbatim in the document's language. Do not summarise, translate, reorder or add anything.
- One section per heading or numbered article (e.g. "Art. 5 Wartefrist"). Keep its full text, including lists and table rows (write table rows as "column: value; column: value").
- Keep every number, amount, percentage, age and period exactly as printed.
- Leave out page headers, footers, page numbers and legal boilerplate that repeats on every page.`;

export async function transcribeProductDocument(file: {
  data: Buffer;
  filename: string;
  productName: string;
}): Promise<{ sections: KnowledgeSection[]; model: string }> {
  const { output } = await generateText({
    model: getModel("extraction"),
    output: Output.object({ name: "product_document", schema: sectionsSchema }),
    instructions: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            data: file.data,
            mediaType: "application/pdf",
            filename: file.filename,
          },
          {
            type: "text",
            text: `Product: ${file.productName}. Transcribe this document into sections.`,
          },
        ],
      },
    ],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const sections = output.sections
    .map((s) => ({
      heading: s.heading.trim().slice(0, 200),
      page: Number.isInteger(s.page) && s.page > 0 ? s.page : null,
      text: s.text.trim(),
    }))
    .filter((s) => s.text.length > 0);
  return { sections, model: modelName("extraction") };
}
