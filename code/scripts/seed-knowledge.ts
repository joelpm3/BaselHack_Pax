/**
 * Loads Pax's own product documents into the product knowledge base (/firma/wissen), so the
 * advisor's lookupProductInfo answers from real brochures, tariff sheets and product pages.
 * Uses the text extracts already in documentation/challenge_context (no model calls); the original PDF, or the
 * website page for products without a brochure, is stored encrypted like an upload. Idempotent:
 * a document whose product and title already exist is skipped.
 * Run: pnpm tsx --require=./scripts/server-only-stub.cjs --env-file=.env.local scripts/seed-knowledge.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { sha256Hex } from "@/lib/documents/crypto";
import { writeEncrypted } from "@/lib/documents/storage";
import type { KnowledgeKind } from "@/lib/domain/learning";
import type { ProductCode } from "@/lib/domain/products";
import { sectionsFromMarkdown, sectionsFromPdfText } from "@/lib/knowledge/plain-text";

const CONTEXT = path.join(process.cwd(), "..", "documentation", "challenge_context");
const WEBSITE = "pax_website/private-vorsorge/produkte";

type Source =
  | { type: "pdf"; dir: "pax_website" | "quicksale"; name: string }
  | { type: "website"; page: string };

interface Seed {
  productCode: ProductCode;
  kind: KnowledgeKind;
  title: string;
  source: Source;
}

const brochure = (name: string): Source => ({ type: "pdf", dir: "pax_website", name });
const tariff = (name: string): Source => ({
  type: "pdf",
  dir: "quicksale",
  name: `private-vorsorge-technische-tarifbestimmungen-${name}`,
});
const website = (page: string): Source => ({ type: "website", page });

const SEEDS: Seed[] = [
  {
    productCode: "todesfall",
    kind: "product_sheet",
    title: "Produktbroschüre Pax Todesfallversicherung",
    source: brochure("private-vorsorge-produktbroschuere-pax-todesfallversicherung"),
  },
  {
    productCode: "todesfall",
    kind: "tariff",
    title: "Technische Tarifbestimmungen Todesfallversicherung",
    source: tariff("fk-fkf-fk2-fkf2-fr"),
  },
  {
    productCode: "todesfall",
    kind: "other",
    title: "Produktseite pax.ch: Todesfallversicherung",
    source: website("pax-todesfallversicherung"),
  },
  {
    productCode: "erwerbsunfaehigkeit",
    kind: "product_sheet",
    title: "Produktbroschüre Pax Erwerbsunfähigkeitsversicherung",
    source: brochure("private-vorsorge-produktbroschuere-pax-erwerbsunfaehigkeitsversicherung"),
  },
  {
    productCode: "erwerbsunfaehigkeit",
    kind: "tariff",
    title: "Technische Tarifbestimmungen Erwerbsunfähigkeit",
    source: tariff("sirjl-sir"),
  },
  {
    productCode: "erwerbsunfaehigkeit",
    kind: "other",
    title: "Produktseite pax.ch: Erwerbsunfähigkeitsversicherung",
    source: website("pax-erwerbsunfaehigkeitsversicherung"),
  },
  {
    productCode: "lifestar",
    kind: "product_sheet",
    title: "Produktseite pax.ch: LifeStar",
    source: website("pax-lifestar"),
  },
  {
    productCode: "lifestar",
    kind: "other",
    title: "Produktseite pax.ch: Spar-Lebensversicherung",
    source: website("pax-spar-lebensversicherung"),
  },
  {
    productCode: "lifestar",
    kind: "tariff",
    title: "Technische Tarifbestimmungen LifeStar",
    source: tariff("lifestar"),
  },
  {
    productCode: "fondsstar",
    kind: "product_sheet",
    title: "Produktbroschüre Pax FondsStar",
    source: brochure("private-vorsorge-produktbroschuere-pax-fondsstar"),
  },
  {
    productCode: "fondsstar",
    kind: "other",
    title: "Flyer Pax FondsStar",
    source: brochure("pax-flyer-fondsstar"),
  },
  {
    productCode: "fondsstar",
    kind: "tariff",
    title: "Technische Tarifbestimmungen FondsStar",
    source: tariff("fondsstar"),
  },
  {
    productCode: "fondsstar",
    kind: "other",
    title: "Produktseite pax.ch: FondsStar",
    source: website("pax-fondsstar"),
  },
  {
    productCode: "pax3a",
    kind: "product_sheet",
    title: "Produktseite pax.ch: Pax 3a",
    source: website("pax-3a"),
  },
  {
    productCode: "auszahlungsplan",
    kind: "product_sheet",
    title: "Produktbroschüre Pax Auszahlungsplan",
    source: brochure("private-vorsorge-produktbroschuere-pax-auszahlungsplan"),
  },
  {
    productCode: "auszahlungsplan",
    kind: "tariff",
    title: "Tarifinformationen Pax Auszahlungsplan",
    source: brochure("private-vorsorge-information-pax-auszahlungsplan-tarifinfos"),
  },
  {
    productCode: "auszahlungsplan",
    kind: "tariff",
    title: "Technische Tarifbestimmungen Auszahlungsplan",
    source: tariff("auszahlungsplan"),
  },
  {
    productCode: "auszahlungsplan",
    kind: "other",
    title: "Produktseite pax.ch: Auszahlungsplan",
    source: website("pax-auszahlungsplan"),
  },
  {
    productCode: "kinderversicherung",
    kind: "product_sheet",
    title: "Produktbroschüre Pax Kinderversicherung",
    source: brochure("private-vorsorge-produktbroschuere-pax-kinderversicherung"),
  },
  {
    productCode: "kinderversicherung",
    kind: "tariff",
    title: "Technische Tarifbestimmungen Kinderversicherung (FirstStep)",
    source: tariff("firststep"),
  },
  {
    productCode: "kinderversicherung",
    kind: "other",
    title: "Produktseite pax.ch: Kinderversicherung",
    source: website("pax-kinderversicherung"),
  },
  {
    productCode: "care",
    kind: "product_sheet",
    title: "Produktseite pax.ch: Pax Care",
    source: website("pax-care"),
  },
];

function load(source: Source) {
  if (source.type === "website") {
    const file = path.join(CONTEXT, WEBSITE, `${source.page}.md`);
    const data = readFileSync(file);
    const sections = sectionsFromMarkdown(data.toString("utf8"));
    return {
      data,
      filename: `${source.page}.md`,
      sections,
      pageCount: null,
      model: "seed:website",
    };
  }
  const dir = path.join(CONTEXT, source.dir);
  const data = readFileSync(path.join(dir, "pdfs", `${source.name}.pdf`));
  const sections = sectionsFromPdfText(
    readFileSync(path.join(dir, "pdf_text", `${source.name}.txt`), "utf8"),
  );
  return {
    data,
    filename: `${source.name}.pdf`,
    sections,
    pageCount: sections.length,
    model: "seed:pdftotext",
  };
}

const kd = schema.knowledgeDocuments;

async function main() {
  let added = 0;
  for (const seed of SEEDS) {
    const exists = db
      .select({ id: kd.id })
      .from(kd)
      .where(
        and(
          eq(kd.productCode, seed.productCode),
          eq(kd.title, seed.title),
          ne(kd.status, "deleted"),
        ),
      )
      .get();
    if (exists) continue;
    const { data, filename, sections, pageCount, model } = load(seed.source);
    if (sections.length === 0) throw new Error(`No text for ${seed.title}`);
    const id = crypto.randomUUID();
    const storagePath = `uploads/knowledge/${id}.bin`;
    await writeEncrypted(storagePath, id, data);
    db.insert(kd)
      .values({
        id,
        entryId: id,
        version: 1,
        productCode: seed.productCode,
        kind: seed.kind,
        title: seed.title,
        filename,
        sizeBytes: data.length,
        sha256: sha256Hex(data),
        storagePath,
        pageCount,
        status: "active",
        sections,
        model,
        activatedAt: new Date(),
      })
      .run();
    audit({
      actorType: "system",
      action: "knowledge.seeded",
      entityType: "knowledge_document",
      entityId: id,
      data: { productCode: seed.productCode, kind: seed.kind, sections: sections.length },
    });
    added++;
  }
  console.log(
    `Product knowledge: ${added} documents added, ${SEEDS.length - added} already there.`,
  );
}

void main();
