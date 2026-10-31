/**
 * Regenerates src/lib/locality/localities.json from the official Swiss directory of localities
 * and postcodes ("Amtliches Ortschaftenverzeichnis mit PLZ", swisstopo, open data, monthly).
 * One row per locality (PLZ4 + Zusatzziffer); a locality that spans several municipalities keeps
 * the municipality with the largest share of addresses.
 * Run: pnpm exec tsx scripts/generate-localities.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const SOURCE =
  "https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.csv.zip";
const OUT = path.join(process.cwd(), "src", "lib", "locality", "localities.json");

/** Extracts the first .csv entry of a zip archive (deflate or stored) via its central directory. */
function unzipCsv(zip: Buffer): string {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Not a zip archive");
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name.toLowerCase().endsWith(".csv")) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    return (method === 0 ? data : inflateRawSync(data)).toString("utf8");
  }
  throw new Error("No CSV in archive");
}

type Row = [zip: string, town: string, canton: string, bfs: number, municipality: string];

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const csv = unzipCsv(Buffer.from(await res.arrayBuffer())).replace(/^﻿/, "");
  const [header, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const cols = header.split(";");
  const col = (name: string) => {
    const index = cols.indexOf(name);
    if (index < 0) throw new Error(`Column ${name} missing`);
    return index;
  };
  const c = {
    town: col("Ortschaftsname"),
    zip: col("PLZ4"),
    extra: col("Zusatzziffer"),
    municipality: col("Gemeindename"),
    bfs: col("BFS-Nr"),
    canton: col("Kantonskürzel"),
    share: col("Adressenanteil"),
  };
  const best = new Map<string, { row: Row; share: number }>();
  for (const line of lines) {
    const f = line.split(";");
    const key = `${f[c.zip]}-${f[c.extra]}`;
    const share = Number.parseFloat(f[c.share]);
    const row: Row = [f[c.zip], f[c.town], f[c.canton], Number(f[c.bfs]), f[c.municipality]];
    const current = best.get(key);
    if (!current || share > current.share) best.set(key, { row, share });
  }
  const rows = [...best.values()]
    .map((v) => v.row)
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1], "de"));
  // One row per line, formatted the way Biome formats JSON, so `pnpm check` stays clean.
  const body = rows.map((r) => `  ${JSON.stringify(r).replaceAll('","', '", "')}`);
  const json = `[\n${body.join(",\n")}\n]\n`.replace(/",(\d+),"/g, '", $1, "');
  writeFileSync(OUT, json);
  console.log(`Wrote ${rows.length} localities to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
