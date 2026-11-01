/**
 * Writes the sample contract PDFs (src/lib/contracts/fixtures.ts) in every language, to check
 * the layout by eye. Run: pnpm exec tsx scripts/render-contract-pdfs.ts [out-dir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { disabilityOffer, disabilityPolicy, lifestarOffer } from "@/lib/contracts/fixtures";
import { renderContractPdf } from "@/lib/contracts/render";
import { LOCALES } from "@/lib/domain/taxonomy";

const out = process.argv[2] ?? "data/contract-previews";
mkdirSync(out, { recursive: true });
const samples = { offer: disabilityOffer, lifestar: lifestarOffer, policy: disabilityPolicy };

async function main() {
  for (const locale of LOCALES) {
    for (const [name, doc] of Object.entries(samples)) {
      const { bytes } = await renderContractPdf({ ...doc, locale });
      const file = path.join(out, `${name}-${locale}.pdf`);
      writeFileSync(file, bytes);
      console.log(file);
    }
  }
}

void main();
