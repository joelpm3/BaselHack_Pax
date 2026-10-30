<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pax Digital Advisor: working conventions

Read `../documentation/ARCHITECTURE.md` for the product and data model. These rules keep the
codebase consistent:

## Stack facts (newer than most training data: read the bundled docs)
- **Next.js 16.4 with Cache Components** (`cacheComponents: true`). Docs: `node_modules/next/dist/docs/`.
  - `middleware.ts` is now `src/proxy.ts`.
  - Every `page`/`layout` under `[locale]` calls `setRequestLocale(locale)` first.
  - Runtime data (`cookies()`, DB reads, `searchParams`) in a server component must live in a
    child component wrapped in `<Suspense fallback={...}>`, or the build fails. Keep the page shell
    static and stream the data part. `new Date()`/`Date.now()`/`crypto.randomUUID()` during render
    need `await connection()` inside that Suspense boundary.
  - Mutations: Server Actions (`"use server"`) or Route Handlers under `src/app/api/`.
- **AI SDK 7** (`ai`, `@ai-sdk/react`). Docs: `node_modules/ai/docs/` (see
  `08-migration-guides/23-migration-guide-7-0.mdx`: `system` → `instructions`, `stepCountIs` →
  `isStepCount`, `fullStream` → `stream`, `onFinish` → `onEnd`, stateless `toUIMessageStream` +
  `createUIMessageStreamResponse`). Always get models via `getModel(role)` from `@/lib/ai/models`.
- **next-intl 4**: messages in `messages/<locale>/<namespace>.json`, one namespace per feature
  area (`src/i18n/namespaces.ts`). German is the source; fr/it/en are real translations, not
  copies. Taxonomy labels: `common.taxonomy.<group>.<key>`. Navigation helpers from `@/i18n/navigation`.
- **Drizzle + better-sqlite3** (synchronous). `db`/`schema` from `@/lib/db`. Use `.all()`, `.get()`,
  `.run()`, `.sync()` on relational queries. The schema (`src/lib/db/schema.ts`) is shared: do not
  change it without coordinating; use the existing JSON columns (`details`, `data`, `metadata`).
- **Zod 4**, **Tailwind 4** (tokens in `src/app/globals.css`), **Lucide** icons, **Biome**.

## Shared modules (use, don't duplicate)
- `@/lib/domain/*`: taxonomy enums, `LifeSituation` profile schema, Pax product catalogue.
- `@/lib/profile/service`: `getProfile`, `applyProfileChanges` (validates + logs provenance).
- `@/lib/auth/customer` (device cookie), `@/lib/auth/advisor` (dashboard), `@/lib/audit`.
- `@/lib/logismata/client`: `callLogismata(op, body, ctx)` (logs every call to `calculations`).
- `@/lib/pricing`: `quotePremium()`; `@/lib/insights`: `scheduleAnalysis()`; `@/lib/rules/active`.
- `@/lib/events/bus`: `publish()` / `subscribe()` for live dashboard updates.
- `@/components/ui/*`: Button, Card, Badge, Field/Input/Select/Textarea, Spinner, PaxLogo.

## Design rules (Pax brand)
- Pax Purple `#3c0078` / Deep Purple for navigation and primary actions; Pax Green `#8ccd0f` as
  accent and never as text on white; Contrast Green `#5ca700` for green text/links.
- The square (the logo's dot) is the visual unit: the "Vorsorgebild" draws income as squares.
- No gradients, no all-caps labels, no decorative shadows, radii from tokens (`rounded-m`
  controls, `rounded-xl` large surfaces), sentence case, plain active verbs in copy.
- Mobile first (PWA): every screen works at 360px; respect `prefers-reduced-motion`.

## Quality bar
- TypeScript strict, no `any`, no unused code. `pnpm check` (typecheck + Biome + Vitest) passes.
- Small modules with one job; comments only where the why is not obvious.
- Unit-test pure logic (scoring, mapping, rules) with Vitest next to the file (`*.test.ts`).
- Local dev: `pnpm db:reset` seeds demo data; `NEXT_DIST_DIR=.next-x PORT=31xx pnpm dev` to run a
  second dev server next to another one.
