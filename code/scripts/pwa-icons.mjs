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

// favicon.ico: a single 48px PNG wrapped in an ICO container (browsers still request /favicon.ico).
const png = await render(48, { maskable: false });
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
header.writeUInt8(48, 6); // width
header.writeUInt8(48, 7); // height
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14); // image size
header.writeUInt32LE(22, 18); // image offset
writeFileSync("src/app/favicon.ico", Buffer.concat([header, png]));
console.log("PWA icons written to public/icons/");
