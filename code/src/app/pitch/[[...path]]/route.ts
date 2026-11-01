import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

/**
 * Serves the pitch deck at /pitch straight from assets/pitch, so the deck lives in one place.
 * /pitch wraps index.html in a document skeleton like build-present.sh does, with a base URL so
 * its relative image and font paths resolve under /pitch/. Only the deck's asset folders are
 * served, not the README or the build script.
 */

const PITCH_DIR = path.join(process.cwd(), "..", "assets", "pitch");
const ASSET_DIRS = new Set(["illustrations", "img", "fonts"]);
const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  await connection();
  const segments = (await params).path ?? [];

  if (segments.length === 0) {
    const deck = await readFile(path.join(PITCH_DIR, "index.html"), "utf8");
    const page =
      '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base href="/pitch/"></head><body>\n' +
      deck +
      "\n</body></html>\n";
    return new Response(page, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  const type = TYPES[path.extname(segments.at(-1) ?? "").toLowerCase()];
  const file = path.resolve(PITCH_DIR, ...segments);
  if (!type || !ASSET_DIRS.has(segments[0]) || !file.startsWith(PITCH_DIR + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    return new Response(new Uint8Array(await readFile(file)), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
