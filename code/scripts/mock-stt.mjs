#!/usr/bin/env node
/**
 * Stand-in for the Swiss-German Nemotron server while the GPU is off. Same API:
 *   GET  /health                       → {"status":"ok"} (or "loading")
 *   POST /v1/audio/transcriptions      multipart file=<audio> → {"text": "..."}
 *
 * Run:   node scripts/mock-stt.mjs                 (port 8009)
 *        PORT=8010 node scripts/mock-stt.mjs --loading   (answers 503 like a server still loading)
 * Then:  STT_BASE_URL=http://127.0.0.1:8009 pnpm dev
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8009);
const LOADING = process.argv.includes("--loading");
const TEXT =
  "Ich bin achtunddreissig, verheiratet und wir haben zwei Kinder. Ich möchte wissen, ob meine Familie abgesichert ist, falls mir etwas passiert.";

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

let busy = false;

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { status: LOADING ? "loading" : "ok", model: "mock", gpu: "none" });
  }
  if (req.method === "POST" && req.url === "/v1/audio/transcriptions") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (LOADING) return json(res, 503, { detail: "model is still loading" });
      const body = Buffer.concat(chunks);
      const type = req.headers["content-type"] ?? "";
      if (!type.startsWith("multipart/form-data") || !body.includes('name="file"')) {
        return json(res, 422, { detail: "file is required" });
      }
      if (busy) console.warn("[mock-stt] overlapping request (the real server serialises these)");
      busy = true;
      console.log(`[mock-stt] ${body.length} bytes received`);
      setTimeout(() => {
        busy = false;
        json(res, 200, { text: TEXT });
      }, 600);
    });
    return;
  }
  json(res, 404, { detail: "not found" });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-stt] listening on http://127.0.0.1:${PORT}${LOADING ? " (loading)" : ""}`);
});
