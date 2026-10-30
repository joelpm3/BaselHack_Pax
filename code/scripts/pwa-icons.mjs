// Renders the PWA icons from the Pax favicon (brand/logo/07_favicon-2000.svg). Run: node scripts/pwa-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";

const svg = readFileSync(new URL("../public/brand/pax-icon.svg", import.meta.url));
const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;

async function render(size, { maskable }) {
  // Maskable icons need the mark inside the 80% safe zone on a full-bleed purple background.
  const inner = maskable ? Math.round(size * 0.8) : size;
  const image = new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#3c0078" : "transparent",
        },
      },
      h("img", { src, width: inner, height: inner }),
    ),
    { width: size, height: size },
  );
  return Buffer.from(await image.arrayBuffer());
}

for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, await render(size, { maskable: false }));
  writeFileSync(`public/icons/icon-maskable-${size}.png`, await render(size, { maskable: true }));
}
writeFileSync("public/icons/apple-touch-icon.png", await render(180, { maskable: true }));
console.log("PWA icons written to public/icons/");
