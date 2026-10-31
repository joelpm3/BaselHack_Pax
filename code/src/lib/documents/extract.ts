import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, modelName } from "@/lib/ai/models";
import type { ExtractedField } from "@/lib/db/schema";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/taxonomy";
import {
  DESCRIPTION_PATH,
  DOCUMENT_FIELDS,
  type FieldDef,
  type FieldKind,
  isExtractable,
} from "./fields";
import { normalizeExtractedFields, type RawField } from "./normalize";

/**
 * Two model calls on the original file (Claude reads PDFs and images natively):
 * 1. classify the document, 2. extract the typed fields for that type with page and quote.
 * Values the document does not print are left out; nothing is inferred.
 */

const TIMEOUT_MS = 120_000;

const DOC_TYPE_GUIDE: Record<DocumentType, string> = {
  pension_certificate:
    "Swiss pension fund certificate, 2nd pillar (Vorsorgeausweis / Versicherungsausweis BVG, certificat de prévoyance LPP, certificato di previdenza LPP)",
  insurance_policy:
    "insurance policy or policy schedule from any insurer (life, pillar 3a, term life, disability, endowment, household, liability, motor, health)",
  salary_certificate:
    "Swiss salary certificate, form 11 (Lohnausweis, certificat de salaire, certificato di salario)",
  other: "anything else (letters, invoices, tax returns, IDs, bank statements, offers)",
};

const classificationSchema = z.object({
  docType: z.enum(DOCUMENT_TYPES),
  description: z
    .string()
    .describe(
      "One short English sentence for an advisor: what it is, issuer, person, year. No amounts.",
    ),
  confidence: z.number().describe("Confidence in docType from 0 to 1"),
});

const VALUE_FORMAT: Record<FieldKind, string> = {
  chf: "CHF amount as a plain number, e.g. 73540 or 1320.50",
  percent: "percent as a number from 0 to 100, e.g. 90",
  integer: "whole number",
  date: "date as YYYY-MM-DD",
  text: "text as printed",
  enum: "one of the listed options",
  boolean: "true or false",
};

function fieldGuide(defs: FieldDef[]): string {
  return defs
    .map(
      (def) =>
        `- ${def.key}: ${def.describe}. Value: ${
          def.kind === "enum" ? `one of ${def.options?.join(", ")}` : VALUE_FORMAT[def.kind]
        }`,
    )
    .join("\n");
}

/**
 * A list of found fields rather than one nullable property per field: the provider's structured
 * output allows only a few nullable parameters, and leaving a field out is the honest "not stated".
 */
function extractionSchema(defs: FieldDef[]) {
  return z.object({
    fields: z.array(
      z.object({
        key: z.enum(defs.map((d) => d.key) as [string, ...string[]]),
        value: z.string().describe("The value in the format the field guide asks for"),
        confidence: z.number().describe("How sure you are the value is right, 0 to 1"),
        page: z.number().describe("1-based page where the value is printed"),
        quote: z.string().describe("Short verbatim text from the document containing the value"),
      }),
    ),
  });
}

const EXTRACTION_INSTRUCTIONS = `You read Swiss insurance and pension documents so a customer can see all their cover in one place.
Rules:
- Return one entry per field the document states. Leave out fields it does not state. Never guess.
- You may convert what a field asks for (monthly to annual amounts, dd.mm.yyyy to YYYY-MM-DD), nothing else.
- Amounts: plain numbers in CHF without thousands separators (73'540.– becomes 73540).
- quote: the exact text snippet (max. 100 characters) where you read the value; page: 1-based page number.
- confidence: 0.95 or more when printed clearly, 0.6 to 0.8 when you had to interpret a label, below 0.5 when unsure.
- If the document shows several values for a field (e.g. with and without interest), take the main projected value with interest and lower the confidence.`;

export interface ExtractionResult {
  docType: DocumentType;
  fields: ExtractedField[];
  model: string;
}

export async function classifyAndExtract(file: {
  data: Buffer;
  mimeType: string;
  filename: string;
  today: string;
}): Promise<ExtractionResult> {
  const filePart = {
    type: "file" as const,
    data: file.data,
    mediaType: file.mimeType,
    filename: file.filename,
  };

  const { output: classification } = await generateText({
    model: getModel("extraction"),
    output: Output.object({ name: "classification", schema: classificationSchema }),
    instructions: `Classify the attached document into exactly one type:\n${Object.entries(
      DOC_TYPE_GUIDE,
    )
      .map(([type, guide]) => `- ${type}: ${guide}`)
      .join("\n")}`,
    messages: [
      { role: "user", content: [filePart, { type: "text", text: "Classify this document." }] },
    ],
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const description: ExtractedField = {
    path: DESCRIPTION_PATH,
    value: classification.description.slice(0, 300),
    confidence: Math.min(1, Math.max(0, classification.confidence)),
    page: null,
    quote: null,
  };
  const docType = classification.docType;
  if (!isExtractable(docType)) {
    return { docType, fields: [description], model: modelName("extraction") };
  }

  const defs = DOCUMENT_FIELDS[docType];
  const { output } = await generateText({
    model: getModel("extraction"),
    output: Output.object({ name: docType, schema: extractionSchema(defs) }),
    instructions: EXTRACTION_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          filePart,
          {
            type: "text",
            text: `Document type: ${DOC_TYPE_GUIDE[docType]}. Today is ${file.today}.\nFields:\n${fieldGuide(defs)}`,
          },
        ],
      },
    ],
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // If the model lists a field twice, keep the more confident reading.
  const byKey: Record<string, RawField> = {};
  for (const item of output.fields) {
    const previous = byKey[item.key];
    if (!previous || item.confidence > Number(previous.confidence)) byKey[item.key] = item;
  }
  return {
    docType,
    fields: [description, ...normalizeExtractedFields(defs, byKey)],
    model: modelName("extraction"),
  };
}
