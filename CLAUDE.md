# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev         # next dev (Turbopack root is cwd)
npm run build       # also regenerates .next/types, which typecheck depends on
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest run
npm run test:watch
```

Node >= 22 is required.

Vitest only picks up `src/**/*.test.ts` in a `node` environment (no jsdom test env, so component tests are not runnable as configured). Run a single file or test with:

```bash
npx vitest run src/lib/ranking.test.ts
npx vitest run -t "recencyScore"
```

Gotchas that cause confusing local failures (see `docs/PROGRESS.md` §2):

- A stale `.next/types/validator.ts` makes `typecheck` fail with "Cannot find module" for deleted routes — run `npm run build` or delete `.next` first.
- `npm ci` cannot delete the SWC binary while `next dev` runs on Windows; stop the dev server or use `npm install`.
- `next dev` rewrites `next-env.d.ts` and the generated Next.js block at the top of `AGENTS.md`; commit those with your work rather than reverting them.

Database work uses the Supabase CLI (`npx supabase db push`, `npx supabase migration new <name>`); migrations live in `supabase/migrations/` and are the only place schema changes belong.

## Knowledge file

A product-scope knowledge file for Marky lives outside this repo, in the PXLBrain vault:

```
C:\Users\DELL\OneDrive\Documents\PXLBrain\Docs\Marky\marky.md
```

**After any material change here, update that file in the same pass and refresh its
`Last synced:` date.** Material means architecture, product behaviour, build status, key decisions,
or edits to `docs/`. Routine refactors, test tweaks and typo fixes do not qualify. Nothing enforces
this automatically — it is deliberately a written rule, not a hook.

Keep its house style (set by `PXLBrain/pxllaw.md`): product-scope knowledge only, code-level detail
left to this file, unknowns marked `TODO` or _(inferred)_ rather than guessed. Update its sections
in place — it is a summary, not a second changelog (`docs/NEW_UPDATES.md` already is one).

## Architecture

Next.js App Router (`src/app/`) + Clerk (identity) + Supabase Postgres (storage, queue, and scheduler). There is no separate backend service: route handlers under `src/app/api/` are the server.

### Three run modes

Every server entry point branches on the same two environment signals, and this is the first thing to check when behavior looks wrong:

- `NEXT_PUBLIC_DEMO_MODE=true` — bundled `src/lib/demo-data.ts` is served, Clerk middleware is bypassed in `src/proxy.ts`, and writes (submissions, item state) return demo or 503 responses. No cloud credentials needed.
- Live, signed out — `src/app/page.tsx` renders `PublicLanding`; API routes return 401.
- Live, signed in — Clerk `auth()` yields `userId`, which is upserted into `profiles.clerk_user_id` to resolve the internal profile UUID.

`src/proxy.ts` (not `middleware.ts` — this Next.js version uses proxy conventions) wraps `clerkMiddleware()`.

### Identity boundary

Clerk's `userId` is never a foreign key. Server code upserts `profiles` on `clerk_user_id` and scopes every private query to the resulting `profile.id`. Route handlers use `createAdminSupabaseClient()` (service key, RLS-bypassing) and therefore carry ownership filtering themselves — the RLS policies in the schema migration are the second line of defense for the Data API, not the enforcement path for these routes. Any new private query must add the `profile.id` filter explicitly.

`src/lib/supabase.ts` exposes only two clients: the publishable-key user client (accepts a Clerk `accessToken` callback) and the secret-key admin client. Both return `null` when env vars are missing, and callers respond 503 rather than throwing.

### Two ingestion paths, one content table

Both paths converge on `content_items`, keyed by `url_hash` = SHA-256 of the canonical URL (`src/lib/url.ts` strips fragments, `utm_*`/`ref`/`fbclid`/`gclid`, default ports, trailing slashes, and sorts query params). That hash is the global dedup key — never insert content without going through `canonicalizeUrl`/`urlHash`.

1. **Scheduled source ingestion** — Supabase `pg_cron` calls `POST /api/cron/ingest` (Bearer `CRON_SECRET`, read from Vault/GUC settings; see `docs/INGESTION.md`). The route picks `sources` that are `is_active` and due by `fetch_interval_minutes`, then fans out through `runWithConcurrency(…, 4, …)`. `src/lib/ingestion/index.ts` is a dispatcher on `source_type` (`medium_rss` | `rss` today) — adding a source type is a contained change there plus a new adapter module.
2. **User link submissions** — `POST /api/submissions` canonicalizes the URL, inserts a `queued` row in `user_submissions`, and pushes onto the `pgmq` queue via the `enqueue_link_ingestion` RPC (service_role only). Draining happens two ways: `after()` fires an inline single-message drain on the request, and `pg_cron` calls `/api/cron/process-links` every minute for a batch of 5. `processLinkQueue` in `src/lib/submissions/queue.ts` moves the row `queued → processing → completed | failed` and deletes the queue message in a `finally` — only after a terminal state. Workers must stay idempotent: content-item writes are hash-lookup-then-update, topic links and `saved_items` are upserts.

A successful submission both stores the content item and creates the `saved_items` row, which is why submitted links appear in the feed.

### Fetch safety

All outbound fetches go through `assertPublicHttpUrl` in `src/lib/ingestion/network.ts`, which resolves DNS and rejects private/loopback/link-local/CGNAT ranges, credentials in URLs, explicit ports, and `localhost`/`.local`. Adapters add conditional requests (ETag/Last-Modified), size caps, and timeouts. Extraction of submitted pages uses Readability + jsdom in `src/lib/ingestion/web.ts`. Do not add a `fetch` of user- or feed-supplied URLs that bypasses this helper.

### Topics, classification, ranking

`src/lib/types.ts` holds the closed list of 12 entity topics as a const tuple; `Interest` and `Topic` are the same type and the DB `topics.name` values must match these strings — the feed route filters out any topic name not in the tuple. `classifyContent` (`src/lib/ingestion/classify.ts`) is deterministic keyword matching, top 3 matches with a confidence score, written to `content_item_topics`.

`src/lib/ranking.ts` is pure and unit-tested — keep scoring logic there rather than in route handlers. `for-you` blends learned affinity, selected-topic match, 48-hour half-life recency, engagement, source diversity, and a deterministic exploration hash; `trending` drops undated items; `latest` sorts by date with unknown dates last. `GET /api/feed` then forces saved items first for `for-you`, dedupes eligible IDs before ranking, and exempts saved items from the recency window. Responses are `Cache-Control: private, no-store`.

Honesty guarantees are enforced in code, not convention: `isValidAuthor` rejects placeholder authors, missing images fall back to text-only cards, and `engagementCount`/`sourceCount` are only what a source actually reported.

### UI

`src/components/marky-app.tsx` is a single large client component (~1400 lines) exporting both `MarkyApp` and `PublicLanding`; `src/app/page.tsx`, `saved/`, and `profile/` are thin server shells that read Clerk state and pass flags into it. `/debug/ingestion` (`src/lib/debug/ingestion-audit.ts`) shows active sources, raw feed responses, recent `content_items`, and `pg_cron` job status — use it before adding logging to ingestion.

### Known unimplemented paths

Do not assume these work: `nextCursor` is always `null` (no pagination), `POST /api/events` validates and returns `{accepted:true}` without persisting, and no X/API source adapters exist. `docs/PROGRESS.md` is the current status table.

State as of 2026-09-09. The audit on 2026-09-08 found 169 stored `content_items` with **0 images and 0 body text**, and no quality gate. Steps 1 and 2 of the Discovery Map (below) now address that in code; **the migrations have not yet been applied to the live project**, so the live numbers still reflect the old pipeline until `npx supabase db push` runs and `POST /api/cron/backfill` is executed.

- Images: `safeImageUrl` (`src/lib/ingestion/rss.ts`) accepts any public HTTPS publisher image; `parseWebMetadata` reads `og:image`, JSON-LD and `twitter:image`. `mediumImageUrl` remains the Medium-only check that adapter still uses.
- Body text: stored from feed `content:encoded` and from Readability for submitted pages.
- Qualification: `src/lib/qualification/` scores every new candidate before storage (threshold 0.6) and logs every verdict to `discovery_candidates`, shown on `/debug/ingestion`.
- Topics: `source_topics` declares a source's topics; `classifyContent` no longer sees the source name (that was why "Google Blog" tagged everything Google).
- Engagement is still not produced: `content_item_signals` exists and the feed reads it, but nothing writes it until discovery adapters land.
- Refresh: seeded `fetch_interval_minutes` lowered to 15 to match the `*/15` cron tick.

### Direction (Marky Discovery Map, 2026-09-08)

Steps 1-2 are built (see above); steps 3-4 are not. Read this before extending ingestion so new work lands in the right shape:

- **Discovery and extraction are separate stages.** Discovery answers "where is the URL"; extraction answers "what is on it". Keeping them apart is what makes a new topic a config row instead of a new scraper. The intended pipeline is discover → extract → **qualify** → classify → rank, with the existing RSS layer kept as the trusted tier everything else is measured against.
- **Qualification is the one algorithm, and it is arithmetic.** A pure, unit-tested 0–1 score computed *before* storage (relevance .35, source trust .20, substance .20, engagement .15, freshness .10; below 0.6 is logged with a reason and never shown), plus hard rejects for duplicate hashes, near-duplicate titles, aggregator/spam domains, and paywalled items with no summary. No embeddings, LLM scoring, or learned ranking until the reject log shows the rules failing.
- **Build order matters:** harden what works (source→topic links, `og:image`/JSON-LD at ingest, body text, cron for submitted links) → qualification and a candidates table → free discovery adapters behind one interface (Hacker News/Algolia, GitHub releases, DEV.to, Reddit, Stack Exchange, YouTube channel feeds, Google/Bing News RSS, feed autodiscovery, registry feeds) with topic config in a table and a quota ledger → extraction chain (API → oEmbed → JSON-LD → Open Graph → Readability) and real engagement/source-count signals feeding `trending`. Quality gate before volume; new sources otherwise make the feed worse first.
- Paid services (SerpApi, Brave, Firecrawl, X search) are gap-fill only, behind a flag, for topics whose free coverage falls under a floor.
- `docs/SOURCE_INGESTION.md` currently forbids search and community sources and contradicts this direction — it needs rewriting as part of that work.
