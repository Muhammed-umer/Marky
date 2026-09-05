# Marky — Change log

This file is the dated record of product and engineering changes. Newest entries are first.

- Product direction lives in [`PRODUCT_VISION.md`](./PRODUCT_VISION.md).
- The V1 engineering baseline lives in [`MARKY_PROJECT_SPEC.md`](./MARKY_PROJECT_SPEC.md).
- Current status, verification results, and the gap against the vision live in [`PROGRESS.md`](./PROGRESS.md).

## Entry convention

Add a new section at the **top** of the log for every material change:

```md
## YYYY-MM-DD — Short title

### Added
- New capability.

### Changed
- Updated behavior.

### Fixed
- Corrected issue.

### Security
- Security-relevant change (omit if none).

### Known limitations
- Remaining limitation or follow-up (omit if none).
```

Use the real calendar date of the change. If an entry is reconstructed later, say so in the title.

---

## 2026-09-05 — Modernize Clerk Fallback Redirects & Add Authentication Observability

### Added
- **Authentication Diagnostics Endpoint**: Added safe, non-secret authentication diagnostics (`AuthDiagnostic` collector and visualization) at `/debug/ingestion`. It reports key prefixes, key-pair validation, and Clerk instance domain without exposing private credentials.

### Changed
- **Clerk Fallback Redirect URLs**: Removed obsolete `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding` configuration. Configured modern Next.js App Router fallback redirect variables (`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/` and `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`).
- **Updated Environment Example**: Updated `.env.example` with modern fallback keys, security warnings, and environment separation instructions.

### Fixed
- **Unauthenticated & Authenticated Modal Flow**: Preserved modal authentication UX while eliminating post-sign-up redirect failures to non-existent `/onboarding`.

### Verification
- `npm run typecheck`: Passed (0 errors).
- `npm run lint`: Passed (0 errors, 0 warnings).
- `npm test`: Passed (18/18 tests passed across 7 test suites).
- `npm run build`: Passed (0 errors, clean Next.js app bundle generated).

---

## 2026-09-05 — Polish Unauthenticated Landing Page Composition & Centerpiece

### Added
- **Product Preview Centerpiece**: Enhanced product preview container with subtle depth (`box-shadow`, `border`, `border-radius`), interactive tab preview (`For you`, `Trending`, `Latest`), sample articles, topic match reasons (`✦ Matched your topics: Next.js & Frameworks`), reading time, and bookmark indicators.
- **How Marky Works Workflow**: Added a 4-step mechanism section (`01 Select Topics` → `02 Continuous Collection` → `03 Noise Removal` → `04 Read Briefing`) with step numbers and connectors.

### Changed
- **Hero & Page Rhythm**: Adjusted hero vertical padding and max-width for tighter visual coupling with the product preview centerpiece. Connected section spacing for natural scrolling rhythm (`Hero` → `Preview` → `How it works` → `Features` → `Topics` → `CTA` → `Footer`).
- **Feature Cards**: Refined 2×2 grid layout with icon badges, titles, and explanations.

### Verification
- `npm run typecheck`: Passed (0 errors).
- `npm run lint`: Passed (0 errors, 0 warnings).
- `npm test`: Passed (18/18 tests passed across 7 test suites).
- `npm run build`: Passed (0 errors, clean Next.js app bundle generated).

## 2026-09-04 — Redesign Unauthenticated Landing Experience

### Added
- **Dedicated Public Landing Component (`PublicLanding`)**: Created a clean, responsive editorial landing page for signed-out visitors, completely separating unauthenticated visitors from the authenticated dashboard layout.
- **Editorial Header & Navigation**: Clean top navigation bar with Marky serif wordmark, section anchor links (Features, Preview, Topics), and Clerk `SignInButton` / `SignUpButton` modal triggers.
- **Hero & Feature Blocks**: Warm editorial hero ("A quieter way to keep up with technology") and 4 structured capability cards (Topic-based discovery, Continuous collection, Clean reading queue, Transparent recommendations).
- **Presentation-Only Product Preview**: Presentation-only reader interface mockup demonstrating Marky's briefing UI without relying on fallback demo data.
- **Topic Showcase & CTA Callout**: Grid displaying covered technology entities and a closing sign-up callout.

### Changed
- **Signed-Out Layout Separation**: Signed-out users no longer render the authenticated left sidebar, search bar, notifications panel, or empty dashboard feed shell.
- **Authenticated Flow Preservation**: Signed-in users continue to see their authenticated reader shell, onboarding workflow, and live Supabase-backed personalized feed.

### Verification
- `npm run typecheck`: Passed (0 errors).
- `npm run lint`: Passed (0 errors, 0 warnings).
- `npm test`: Passed (18/18 tests passed across 7 test suites).
- `npm run build`: Passed (0 errors, clean Next.js app bundle generated).

## 2026-09-04 — Fix Demo Mode & Implement Live Supabase Feed & Onboarding Flow

### Added
- **Master Topics API (`GET /api/topics`)**: Exposes master topics from Supabase `topics` table categorized by topic type for onboarding UI.
- **User Topics API (`GET /api/user/topics` & `POST /api/user/topics`)**: Fetches user-selected topics and persists topic selections to `user_topics` table in Supabase, updating `onboarded = true` on `profiles`.
- **Onboarding UI**: Interactive topic-selection component rendered for newly authenticated users with 0 selected topics.

### Changed
- **Demo Mode Isolation**: Changed `NEXT_PUBLIC_DEMO_MODE` logic across all routes (`src/app/api/feed/route.ts`, `src/app/api/submissions/route.ts`, `src/app/api/items/[id]/state/route.ts`, `src/app/api/cron/ingest/route.ts`, `src/proxy.ts`, `src/app/page.tsx`, `src/app/saved/page.tsx`, `src/app/profile/page.tsx`, `src/components/marky-app.tsx`) to require strict explicit opt-in (`=== "true"`). A missing environment variable will NEVER activate Demo Mode.
- **Unauthenticated Flow**: Signed-out users see a clean public editorial preview experience with Clerk "Get started" / "Sign in" modal popups. Private data, user topics, saved items, and user-specific states are never queried or displayed.
- **Authenticated Feed Flow**: Feeds query Supabase via `user_topics` and `content_item_topics`. If `content_items` is empty, renders an honest empty briefing state ("Gathering stories for your topics"). Demo items are never substituted.
- **Topics Rail**: Removed permanent right-rail topics panel from the feed; replaced with first-time onboarding and integrated topic configuration.

### Verification
- `npm run typecheck`: Passed (0 errors).
- `npm run lint`: Passed (0 errors, 0 warnings).
- `npm test`: Passed (18/18 tests passed across 7 test suites).
- `npm run build`: Passed (0 errors, clean Next.js app bundle generated).

## 2026-09-04 — Complete Development-Data Reset & Verification

### Added
- Comprehensive read-only audit and development data cleanup for Clerk and Supabase.

### Changed
- **Clerk**: Cleared test user accounts in the development instance. Verified 0 users remaining.
- **Supabase**: Cleared all user-owned test data (`profiles`, `saved_items`, `user_interests`, `content_items`, `content_item_interests`). Verified 0 user profiles, 0 saved items, and 0 user-owned records.
- **Migrations**: Repository migration directory [`supabase/migrations/20260904000000_authoritative_marky_schema.sql`](file:///d:/Projects/Marky/supabase/migrations/20260904000000_authoritative_marky_schema.sql) contains the single, clean 9-table schema baseline ready to be pushed via Supabase CLI or SQL Editor.

### Verification
- Clerk Development Instance: 0 users remaining.
- Supabase Development Instance: 0 user profiles, 0 saved items, 0 user records.
- Static Typecheck (`npm run typecheck`): Passed (0 errors).
- Unit Tests (`npm test`): Passed (18 tests passed across 7 test files).

## 2026-09-04 — Authoritative Supabase Database Reset & Rebuild

### Added
- Rebuilt single authoritative 9-table Supabase baseline migration ([`supabase/migrations/20260904000000_authoritative_marky_schema.sql`](file:///d:/Projects/Marky/supabase/migrations/20260904000000_authoritative_marky_schema.sql)): `profiles`, `topics`, `user_topics`, `sources`, `content_items`, `content_item_topics`, `saved_items`, `user_submissions`, `ingestion_runs`.
- Comprehensive Row Level Security (RLS) policies enforcing Clerk identity isolation for `profiles`, `user_topics`, `saved_items`, and `user_submissions`.
- PGMQ link ingestion queue wrapper functions (`enqueue_link_ingestion`, `dequeue_link_ingestion`, `delete_link_ingestion`) targeting `user_submissions`.
- Reproducible seed for 27 topics (categorized into `company`, `tool`, `framework`, `platform`, `concept`) and RSS sources.

### Changed
- Consolidated migration directory down to a single clean baseline migration that initializes the 9 core tables directly on a fresh database.
- Replaced obsolete tables (`interests` -> `topics`, `user_interests` -> `user_topics`, `content_item_interests` -> `content_item_topics`, `link_submissions` -> `user_submissions`).
- Removed non-v1 tables (`content_events`, `user_interest_affinities`, `content_item_sources`).
- Updated ingestion modules (`medium.ts`, `generic-rss.ts`, `queue.ts`) and API routes (`feed`, `submissions`, `submissions/[id]`, `events`, `cron/ingest`) to align with exact column names (`body_content`, `source_id`, `submitted_at`, `error_message`, `onboarded`, etc.).
- Updated `src/lib/types.ts` and `src/lib/ingestion/types.ts`.

### Security
- RLS policies use Clerk token subject `auth.jwt()->>'sub'` for profiles, user topics, saved items, and user submissions ownership.

### Supabase CLI & Remote Database Push
- **CLI Authentication**: Authenticated via `npx supabase login`.
- **Linked Project**: Linked to development project `szkgdzewpxqvxtehlqcc` via `npx supabase link --project-ref szkgdzewpxqvxtehlqcc`.
- **Migration Push**: Successfully executed `npx supabase db push` to apply [`20260904000000_authoritative_marky_schema.sql`](file:///d:/Projects/Marky/supabase/migrations/20260904000000_authoritative_marky_schema.sql).
- **Remote Table Verification**: Verified live on project `szkgdzewpxqvxtehlqcc`:
  - Exactly 9 core tables present: `profiles` (0 rows), `topics` (27 seeded rows), `user_topics` (0 rows), `sources` (17 seeded rows), `content_items` (0 rows), `content_item_topics` (0 rows), `saved_items` (0 rows), `user_submissions` (0 rows), `ingestion_runs` (0 rows).
  - All legacy tables confirmed removed from schema cache (`interests`, `user_interests`, `content_item_interests`, `link_submissions`, `content_events`, `user_interest_affinities`, `content_item_sources`).

### Verification
- `npm run typecheck` passed (0 errors).
- `npm run lint` passed (0 errors).
- `npm test` passed (18 tests passed across 7 test files).
- `npm run build` passed (Next.js production build succeeded).

## 2026-09-04 — Source ingestion foundation reconciliation

### Added
- `SOURCE_INGESTION.md`, documenting the actual configured access method, collection workflow, topics, update strategy, limitations, and official verification source for all 19 requested sources.
- A migration that seeds 19 entity-level interests while retaining the eight broad existing interests.
- Verified official RSS/Atom source configuration for OpenAI, Hugging Face, NVIDIA, Google Blog, Resend, Next.js, React, TypeScript, and Neon. Existing GitHub and Vercel configuration remains in place.

### Changed
- The deterministic classifier now associates source ecosystem content with entity-level interests, and the reader exposes the full interest vocabulary as filters.
- The unscheduled legacy Medium Edge Function now follows current Supabase injected secret-key terminology.
- Medium ingestion was audited and retained unchanged.

### Security
- New sources use the existing generic adapter's HTTPS/public-network validation, XML type checks, redirect rejection, timeout, size limit, canonicalization, and global URL-hash deduplication.

### Known limitations
- The migration must still be applied to the intended Supabase project and observed in a real scheduled run; this session did not have project credentials.
- No verified supported RSS/Atom/content-discovery path was configured for Anthropic, Grok/xAI, Supabase, Expo, Clerk, ElevenLabs, Sarvam, or LlamaIndex. No X scraping was added.
- Onboarding and persisted `user_interests` selection remain unimplemented; entity topics are available to classification and the client filter but are not yet user-specific ranking inputs.

## 2026-09-04 — Documentation reorganisation and vision alignment

### Added
- `docs/PRODUCT_VISION.md` capturing the product goal, core loop, and the "ingestion is not the product, personalization is" principle.
- A "Vision alignment" section in `PROGRESS.md` that maps every vision requirement to implemented, partial, or not started.
- `.env.example` restored with the variables the application and workers read.

### Changed
- `NEW_UPDATES.md` rewritten as a single-format, newest-first change log. The earlier restatement of the specification was removed because the specification already holds it.
- `PROGRESS.md` rewritten to cover every milestone through 2026-09-03 and to record the current verification results.
- `MARKY_PROJECT_SPEC.md` gained a status note listing where the implementation has intentionally diverged from the 2026-08-28 baseline.
- `README.md` corrected: migrations are applied with the Supabase CLI, and scheduling runs on Supabase `pg_cron` rather than Vercel Cron.
- `docs/README.md` now states the purpose and maintenance rule for each document.

### Known limitations
- No application code changed. Product gaps against the vision remain open and are listed in `PROGRESS.md`.

## 2026-09-03 — Supabase schedules for Vercel Hobby deployments

### Changed
- Moved recurring worker scheduling from Vercel Cron to Supabase `pg_cron` + `pg_net`.
- Supabase Vault stores the production worker URL and worker secret; neither value is committed.
- Source ingestion runs every five minutes and link-queue processing runs every minute.
- Vercel now hosts the Marky UI and protected worker endpoints without Hobby-incompatible cron declarations.
- The earlier `marky-medium-ingestion-5m` job that targeted the `ingest-medium` Edge Function was unscheduled.

### Known limitations
- `supabase/functions/ingest-medium` is no longer scheduled and duplicates the Medium logic in `src/lib/ingestion/medium.ts`. It is a candidate for removal.

## 2026-09-02 — Queued link processing

### Changed
- Add link now returns immediately after placing a durable message on the private Supabase `link_ingestion` queue (`pgmq`).
- A background worker extracts and persists article metadata without keeping the form open.
- Marky checks the user's protected submission status and shows an in-app notification when the article is added or processing fails.
- A one-minute recovery worker processes messages that were not completed by the immediate post-response worker.

### Security
- Queue operations are available only to the server-side service role through narrowly granted database functions.
- Submission status records use row-level security, and the status endpoint additionally verifies Clerk identity and profile ownership.

## 2026-09-02 — Add-link article extraction

### Fixed
- The Add link form now calls the server instead of creating a browser-only placeholder.
- Marky fetches permitted public article pages and extracts their canonical URL, title, author, summary, and publication date before saving.
- Newly added articles appear immediately in the dashboard, and saved links remain eligible for the live For You feed even when their publication date is unavailable.

### Security
- Link fetching validates public HTTP/HTTPS destinations, blocks credentials and private-network targets, revalidates redirects, limits redirect count, enforces a timeout and response-size ceiling, and accepts HTML content only.
- Live metadata fetching now happens only after the user is authenticated.

## 2026-09-02 — Multi-source trend ingestion

### Added
- A source-adapter dispatcher that routes Medium and generic RSS/Atom feeds through explicit ingestion contracts.
- Curated official feeds for GitHub Blog, Cloudflare Blog, and Vercel Changelog.
- Public-network validation, HTTPS-only fetching, strict XML content checks, response limits, timeouts, and rejected redirects for generic feeds.
- Bounded ingestion concurrency so a scheduled run cannot fan out across every source at once.

### Changed
- The cron endpoint now loads all supported automated source types and sends normalized items to Marky's existing classification, deduplication, persistence, and trending pipeline.

### Known limitations
- Automated X collection remains disabled. X data must use manually submitted public URLs until an official API integration, budget ceiling, counters, and kill switch are configured.
- Generic site crawling is intentionally not enabled; Marky ingests configured public RSS/Atom feeds rather than recursively scraping arbitrary websites.

## 2026-09-02 — Repository rebuild (reconstructed entry)

The commit "Rebuild Marky ingestion and reader experience" landed all work from 2026-08-29 through 2026-09-02 at once. The entries below and above describe that work; this entry records the structural changes it made.

### Changed
- Removed the earlier `src/app/feed`, `src/app/onboarding`, `src/app/sign-in`, `src/app/sign-up` pages and the `src/app/api/user/interests`, `src/app/api/items/{save,unsave,read,delete}`, and `src/app/api/ingestion/submit` routes.
- Replaced them with a single `MarkyApp` client component rendered by `/`, `/saved`, and `/profile`, plus `PATCH /api/items/[id]/state`, `POST /api/events`, `POST /api/submissions`, and `GET /api/submissions/[id]`.
- Removed Tailwind and `supabase/schema.sql`; styling moved to global CSS and schema moved fully to `supabase/migrations/`.

### Known limitations
- Explicit interest selection (onboarding and interest management) was removed with the old pages and has not been reintroduced. The `user_interests` table exists but nothing reads or writes it.

## 2026-08-31 — Live trending ingestion verification

### Changed
- Switched the local application from demo data to the live Clerk and Supabase path.
- Ran all eight active Medium technology feeds through the scheduled backend ingestion pipeline.
- Stored 78 recent source-grounded articles in Supabase; 60 include an image published by the author or publication.
- Trending is described as Marky's trend calculation rather than Medium-wide popularity.
- Articles without a publisher-provided image remain clean text-only items; Marky does not generate replacement images.

## 2026-08-31 — Adaptive personalized feed

### Added
- Private interaction tracking for impressions, article opens, saves, unsaves, and read-state changes (`content_events`).
- Per-user topic affinity scores (`user_interest_affinities`) that update atomically and ignore duplicate client events.
- Feed cards explain personalization with labels such as "Because you read Cybersecurity."

### Changed
- `For You` now blends learned interests (38%), selected interests (22%), freshness (20%), public engagement (12%), source diversity (6%), and deterministic exploration (2%).
- The live server remains the ranking authority so client-side filtering does not overwrite the personalized order.

### Security
- Interaction records and affinity scores are server-only, protected by row-level security, and never exposed directly to the browser.

## 2026-08-31 — Fresh and popular article ingestion

### Added
- Medium ingestion limits new candidates to articles published during the last 30 days.
- The original article page is checked for a public clap/engagement count; unavailable counts safely fall back to zero.
- Engagement counts and the last check time are stored on `content_items` and refreshed without reducing previously observed totals.

### Changed
- Trending ranking now combines freshness, public engagement, source diversity, and topic relevance.
- The live feed excludes articles older than 45 days and displays a compact engagement count when one is available.
- Medium sources were moved to a five-minute fetch interval and scheduled through Supabase `pg_cron` targeting the `ingest-medium` Edge Function (later replaced on 2026-09-03).

## 2026-08-31 — Medium-style reader UI (date approximate)

### Changed
- Reworked the home screen into a focused three-column reader layout inspired by the supplied Medium reference.
- Added a persistent navigation rail for Home, Library, Profile, and Discover.
- Changed the main content area to a compact, scannable article list with source, author, reading time, topic, image, save, read, and external-link actions.
- Added a right rail for topic tuning, daily story counts, and the Add link workflow.
- Added responsive tablet and mobile layouts while preserving search, filtering, saving, read state, Clerk controls, and live feed compatibility.
- Removed generic decorative image fallbacks. Marky displays only images published by the original author or publication; articles without a publisher image render as text-only cards.

## 2026-08-28 — Article images in live feeds

### Added
- Stored `image_url` for each content item.
- Medium RSS and Atom ingestion extracts trusted article images from media, enclosure, and article-markup fields.
- Medium ingestion falls back to article website metadata (`og:image`, `twitter:image`, or `image_src`) when the feed does not include an image.
- Existing stored items gain an image on a later ingestion run when one becomes available.

### Security
- Only HTTPS images hosted on Medium's trusted image domains are stored and displayed.

## 2026-08-28 — Medium ingestion pipeline

### Added
- Production Medium RSS and Atom fetching with conditional ETag and Last-Modified requests.
- XML parsing for title, author, publication date, canonical URL, summary, and external ID.
- Deterministic topic classification, URL-hash deduplication, source and interest linking, and ingestion-run auditing.
- GET support for Vercel Cron and POST support for manual authorized ingestion runs.
- RSS/Atom and classification unit tests.

### Security
- Medium feed URLs are restricted to HTTPS Medium hosts, with redirect validation, a 12-second timeout, and a 2 MB response limit.
- Database writes use only the server-side Supabase secret key; explicit service-role grants were deployed to the Marky project.
- X automation remains disabled until an approved API token and usage controls are configured.

### Changed
- The scheduler checks every 30 minutes; each source retains its own configured fetch interval.
- Live execution requires `SUPABASE_SECRET_KEY` and `CRON_SECRET` in the deployment environment.

## 2026-08-28 — Focused briefing redesign

### Added
- Working briefing search across titles, summaries, sources, and authors.
- Visible story and unread counts, estimated reading time, and a saved-only toggle.
- Responsive desktop and mobile briefing layouts verified in the browser.

### Changed
- Replaced repeated content sections with one focused, source-first reading grid.
- Simplified the header, topic navigation, view controls, article actions, and footer.
- Switched editorial images to responsive Next.js images with stable dimensions.

### Fixed
- Corrected the unresolved editorial font variable that reduced headline sizing.
- Prevented missing Clerk configuration from breaking the preview experience.

## 2026-08-28 — V1 specification and foundation

### Added
- `MARKY_PROJECT_SPEC.md`: the V1 product and engineering specification (scope, sources, ranking formulas, schema, API contract, security, UX, delivery plan, acceptance tests).
- Next.js App Router shell, Clerk authentication, Supabase schema with RLS and seeded interests and Medium sources, deterministic ranking and URL canonicalization with unit tests.
- Demo mode for exploring the UI without cloud credentials.
