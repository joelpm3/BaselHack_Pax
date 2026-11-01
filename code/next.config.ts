import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Separate build dirs let several dev servers run side by side (NEXT_DIST_DIR=.next-x).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["better-sqlite3"],
  // Build only. By default `next build` forks one page-data/prerender worker per core minus one
  // (15 here), each loading every server chunk. On the shared box that pushes the build over the
  // session's memory.high limit and the kernel throttles it for minutes. Four workers prerender
  // the ~107 pages just as fast without the memory spike.
  experimental: { cpus: 4 },
  // Build only: skip loading server source maps into every prerender worker. They only make
  // prerender error stacks prettier; use `next build --debug-prerender` when debugging one.
  enablePrerenderSourceMaps: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
