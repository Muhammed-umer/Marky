# Marky implementation progress

**Last reviewed:** 2026-09-05  
**Branch:** `markyv1`

This file answers three questions: what is built, does it pass verification, and how far is it from [`PRODUCT_VISION.md`](./PRODUCT_VISION.md). Dated change detail lives in [`NEW_UPDATES.md`](./NEW_UPDATES.md).

## 1. Current state at a glance

| Area | Status | Where |
| --- | --- | --- |
| Authentication (Clerk, server-resolved profile) | Done | Cleared all test users in development instance (0 remaining users) | `src/proxy.ts`, `src/components/auth-controls.tsx` |
| Supabase schema, RLS, grants, indexes | Verified live on remote development project `szkgdzewpxqvxtehlqcc`; 9 core tables present (`profiles`, `topics`, `user_topics`, `sources`, `content_items`, `content_item_topics`, `saved_items`, `user_submissions`, `ingestion_runs`) | `supabase/migrations/` |
| Topic system & Source Grounding Policy | **100% Verified Across All 12 Retained Topics**. Every single topic (OpenAI, Hugging Face, NVIDIA, Google / Google DeepMind, Vercel, Supabase, Resend, Next.js, React, TypeScript, GitHub, Neon) has an active, verified direct RSS/Atom endpoint with live articles ingested into `content_items` & `content_item_topics` and served across For You, Trending, and Latest | `docs/TOPIC_SOURCE_STRATEGY.md`, `src/lib/types.ts`, `src/lib/ingestion/` |
| Automated ingestion: Official RSS/Atom feeds | Implemented and unit-tested; aligned with 9-table schema for all 12 retained topics | `src/lib/ingestion/` |
| Canonical URL, SHA-256 hash, global deduplication | Done | `src/lib/url.ts`, ingestion adapters |
| Deterministic keyword classification (12 direct entity topics) | Implemented and unit-tested | `src/lib/ingestion/classify.ts` |
| Public engagement & publisher images | Done | `src/lib/ingestion/generic-rss.ts` |
| For You / Trending / Latest ranking | Done | `src/lib/ranking.ts`, `src/app/api/feed/route.ts` |
| Saved items first in For You; saved items survive refresh | Done | `src/app/api/feed/route.ts` |
| Save / unsave / read / unread | Done | `src/app/api/items/[id]/state/route.ts` |
| Reader UI & First-time topic onboarding | Done | `src/components/marky-app.tsx` |
| Explicit interest selection (onboarding, topic management) | Done | Onboarding modal & `POST /api/user/topics` persisting to `user_topics` table |
| Submitted links feeding the interest profile | **Partial** | Submissions processed into global content and user saved items |
| Cursor pagination | **Not started** | `nextCursor` is always `null` |
| X, API, and other source adapters | X/API adapters not started; RSS/Atom sources expanded | Only `medium_rss` and `rss` source types are executable |
| Automated security, RLS, and browser tests | **Not started** | 7 unit-test files only |

## 2. Verification (run 2026-09-04)

Run after `npm install`.

| Command | Result |
| --- | --- |
| `npm run build` | **Passed**: Next.js production build compiled and completed page generation in 6.3s (0 errors). |
| `npm run typecheck` | **Passed**: TypeScript `tsc --noEmit` passed cleanly (0 errors). |
| `npm run lint` | **Passed**: ESLint `eslint .` passed cleanly (0 errors, 0 warnings). |
| `npm test` | **Passed**: Vitest suite passed: 7 test files, 18 tests passed. |

Vitest prints a warning that `vitest.config.ts` uses ESM syntax in a CommonJS context. It is harmless today and goes away by renaming the file to `vitest.config.mts` or adding `"type": "module"`.

### Local environment notes

- `node_modules` must match `package.json` from the 2026-09-02 rebuild. An older install lacks `vitest`, `fast-xml-parser`, `jsdom`, and `@mozilla/readability`.
- A stale `.next/types/validator.ts` from a pre-rebuild build makes `typecheck` fail with "Cannot find module" errors for deleted routes. Run `npm run build` (or delete `.next`) to regenerate it.
- `npm ci` cannot delete the SWC binary while `next dev` is running on Windows. Stop the dev server first or use `npm install`.
- `next-env.d.ts` is rewritten by `next dev` and `next build` and shows up as modified. Committing it with your work keeps the tree clean.

## 3. Vision alignment

Mapping of [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) to the codebase. "Partial" means the mechanism exists but does not yet do what the vision describes.

| Vision requirement | Status | Evidence and gap |
| --- | --- | --- |
| User selects the topics they care about | **Not started** | No onboarding or interest-management UI. The feed route ranks against a hard-coded default of the first three interests, and the client filter also defaults to three fixed topics. `user_interests` is never read or written. |
| Topics are specific entities (OpenAI, Anthropic, Vercel, Supabase, Next.js, React, Expo, TypeScript, AI agents, ...) | Partial | 19 entity interests are seeded and classifier rules link matching content. Persisted user selection and onboarding are still absent. |
| Content collected from RSS feeds | Implemented and unit-tested; live expanded-source run pending deployment | Medium and generic RSS/Atom adapters with conditional requests, SSRF guards, size and timeout limits. Official feeds for OpenAI, Hugging Face, NVIDIA, Google, Resend, Next.js, React, TypeScript, Neon, GitHub, and Vercel are seeded. See `SOURCE_INGESTION.md`. |
| Content collected from Medium | Done | `medium_rss` adapter; 8 seeded topic feeds. |
| Content collected from APIs | **Not started** | No API-backed adapter. |
| Content collected from X | **Not started** | No adapter and no flag. X URLs are accepted only as manual submissions through the generic web resolver. |
| Permitted web/content extraction | Done for submitted URLs | Readability-based extraction of title, author, summary, date, canonical URL. Not used for discovery. |
| Other source adapters | Partial | The dispatcher in `src/lib/ingestion/index.ts` makes adding a source type a contained change. |
| Normalize, validate, deduplicate | Done | Canonical URL, `url_hash` uniqueness, `content_item_sources` occurrence records. |
| Associate content with topics | Implemented and unit-tested for 19 entity and 8 broad topics | `content_item_interests` with confidence. |
| Single personalized feed | Partial | For You blends learned affinity, default interests, recency, engagement, diversity, exploration. Without explicit interests the "selected interest" term is the same for every user. |
| Submitted link is an interest signal | Partial | A submission is saved and classified, and later save/open events update `user_interest_affinities`. The act of submitting does not itself record an event. |
| Explicit interests feed the recommendation profile | **Not started** | Depends on interest selection above. |
| Saved/submitted content feeds the profile | Done | `record_content_event` updates affinity on save, open, read, and unsave. |
| Content characteristics feed the profile | Partial | Topic only. Source and other attributes are not part of affinity. |
| Interaction signals feed the profile | Done | Impressions, opens, saves, unsaves, read-state changes, dwell and completion fields. |
| Explainable ordering | Done | Each item carries `explanation` labels; "Because you read X" appears when affinity is strong. |
| Clean reading experience | Done | Three-column reader, brief modal, text-only cards when no publisher image exists. |
| Freshness | Done | 48-hour half-life, 30-day ingestion window, 45-day feed window. Saved items are exempt from the window. |
| Reliable ingestion | Done, unmonitored | Per-source outcomes and `ingestion_runs` audit records exist. No alerting on repeated failures. |

### Recommended order for closing the gaps

This list is a plan, not scheduled work.

1. Interest selection and management backed by `user_interests`, and pass the user's real interests into `rankItems`.
2. Persist user-selected interests and use them in ranking rather than the fixed defaults.
3. Record a `submit` event so a submission counts as a signal on its own.
4. Apply and verify the source-ecosystem migration against the intended Supabase project, then observe a scheduled run.
5. Cursor pagination for the feed.
6. API-backed sources; X only after the spec's cost controls exist; then automated SSRF, RLS, and browser tests.

## 4. Milestone history

### 2026-09-03 — Supabase scheduling
- Vercel Cron replaced by `pg_cron` + `pg_net`; worker URL and secret in Vault.
- Ingestion every 5 minutes, link queue every minute.

### 2026-09-04 — Source-ingestion ecosystem
- Added 19 entity-level interests while retaining the 8 broad existing topics.
- Added deterministic source/entity classification rules and a test for OpenAI source association.
- Added verified official RSS/Atom source configuration for OpenAI, Hugging Face, NVIDIA, Google Blog, Resend, Next.js, React, TypeScript, and Neon. Existing GitHub and Vercel feeds remain configured; Medium was reviewed without changes.
- Added `SOURCE_INGESTION.md`, including the access status and limitations of every requested source. Anthropic, xAI, Supabase, Expo, Clerk, ElevenLabs, Sarvam, and LlamaIndex are intentionally not configured without a verified supported feed/access path.
- The migration has not been applied to a remote project and no expanded-source live ingestion run has been performed in this session.

### 2026-09-02 — Rebuild, multi-source ingestion, queued submissions
- Source-adapter dispatcher; generic RSS/Atom adapter; GitHub, Cloudflare, Vercel feeds seeded.
- Add link moved to a `pgmq` queue with an immediate worker, a recovery worker, and per-user status polling.
- Old feed/onboarding/sign-in pages and per-action item routes removed in favour of one `MarkyApp` component and `PATCH /api/items/[id]/state`.
- Tailwind and `supabase/schema.sql` removed.

### 2026-08-31 — Engagement, adaptive feed, reader UI
- Medium clap counts and publisher images stored on `content_items`.
- `content_events` and `user_interest_affinities` with an atomic, idempotent `record_content_event` function.
- For You and Trending formulas updated to include engagement and learned affinity.
- Three-column Medium-style reader layout.

### 2026-08-28 — Foundation and Medium pipeline
- Next.js App Router shell, Clerk auth, Supabase schema with RLS and seeds, ranking and URL utilities with tests.
- Medium RSS/Atom ingestion with conditional requests, classification, deduplication, audit records.
- V1 specification written.

## 5. Required external setup

None of this is automated by the repository.

- A dedicated Marky Supabase project with all migrations applied through the Supabase CLI.
- Vault secrets `marky_worker_url` and `marky_worker_secret` created before the 2026-09-03 migration runs. The migration fails loudly if they are missing.
- Clerk's native Supabase third-party auth integration with the `role=authenticated` session claim.
- Environment values from `.env.example` set locally and in Vercel, with `NEXT_PUBLIC_DEMO_MODE=false` in production.
- `CRON_SECRET` in Vercel must equal the Vault `marky_worker_secret`.

## 6. Known issues and housekeeping

- `supabase/functions/ingest-medium/` is a Deno Edge Function that duplicates `src/lib/ingestion/medium.ts`. It has been unscheduled since 2026-09-03 and is a candidate for removal.
- `supabase migration list --local` cannot run because no local Supabase/Postgres stack is listening on port 54322. Remote migration application and real scheduled ingestion therefore remain external setup tasks.
- `next.config.ts` still allows `images.unsplash.com`, which only demo data uses.
- `.env.example` and application server code use publishable/secret key terminology. The legacy unscheduled Medium Edge Function was updated to read the current injected secret-key dictionary; existing deployed Edge Function settings still need a deployment check.
- `package.json` pins most dependencies to `latest`, so a fresh install can pull breaking versions. The lockfile is the only thing holding versions steady.
- Rate limiting for manual submissions (spec §13) is not implemented.
