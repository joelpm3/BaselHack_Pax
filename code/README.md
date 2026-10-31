# Pax Clara

BaselHack 2026, Pax challenge "AI that makes life insurance simple" (Team A4).
Product, data model and design decisions: [`../documentation/ARCHITECTURE.md`](../documentation/ARCHITECTURE.md).
Coding conventions: [`AGENTS.md`](AGENTS.md).

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY, LOGISMATA_API_TOKEN, SESSION_SECRET, DOCUMENT_ENCRYPTION_KEY
pnpm db:reset                # SQLite in ./data with advisors, rule set v1 and three demo customers
pnpm dev                     # http://localhost:3000/de
```

Production build: `pnpm build && PORT=3210 pnpm start`.

| URL | What |
|---|---|
| `/de` | Customer entry: start an advice conversation or pick a demo customer |
| `/de/portal` | Vorsorge-Cockpit (policies, documents, hints, conversations) |
| `/de/firma` | Company dashboard (password `COMPANY_PASSWORD`, default `pax-demo`) |
| `/de/firma/simulation` | Run simulated customers against the real advisor |

Locales: `de`, `fr`, `it`, `en`.

## Services

- **LLM**: `LLM_PROVIDER=anthropic` (Haiku) today; `openai-compatible` + `LLM_BASE_URL` for a
  self-hosted vLLM endpoint. Per-role overrides: `LLM_MODEL_CHAT|ANALYSIS|EXTRACTION|SIMULATION`.
- **Logismata** (pension and tax calculations): `LOGISMATA_API_TOKEN` (expires 2026-11-03).
- **Pax Quicksale** (live premiums): no credentials; an estimate is used when it is unreachable.
- **Swiss-German speech** (Nemotron on Nebius): start it with
  `python cookbook/nebius-nemotron/nebius_gpu.py up --gpu b200` in the `swiss-german-stt` repo,
  keep the SSH tunnel on `127.0.0.1:8000` (`STT_BASE_URL`). For UI work without the GPU:
  `node scripts/mock-stt.mjs` and `STT_BASE_URL=http://127.0.0.1:8009`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm check` | Typecheck, Biome, Vitest |
| `pnpm db:reset` / `pnpm db:seed` | Fresh demo database / seed if empty |
| `pnpm db:generate --name <x>` | New Drizzle migration after a schema change |
| `pnpm exec tsx scripts/sample-docs.ts` | Regenerate the fictional demo PDFs in `public/samples/` (May Müller: Lohnausweis, Vorsorgeausweis, Police; Taylor Johnson: Vorsorgeausweis) |
| `node scripts/pwa-icons.mjs` | Regenerate PWA icons and favicon from the Pax mark |
