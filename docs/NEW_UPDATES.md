# Marky — New Updates

**Document date:** 2026-08-28  
**Source:** `docs/MARKY_PROJECT_SPEC.md`  
**Specification status:** V1 implementation specification

This document records the product and engineering decisions currently defined for Marky. It can be updated as implementation work introduces additional features, changes, or limitations.

## Product direction

- Marky is defined as a calm, personalized technology-trend reader for developers, founders, product managers, and technology enthusiasts.
- The product focuses on source-grounded technology discovery, transparent ranking, deduplication, saving, and reading-state management.
- V1 is explicitly not a social network, general search engine, or AI news generator.

## V1 features added to the specification

- Clerk authentication using Google, LinkedIn, and verified email/password.
- Interest selection during onboarding.
- Automated Medium ingestion through official RSS feeds.
- Manual submission of public HTTP/HTTPS links, including X and Twitter URLs.
- Deterministic topic classification using curated keywords and feed metadata.
- Three feed modes: `For You`, `Trending`, and `Latest`.
- Interest, read-state, and saved-state filters.
- Save, unsave, mark-read, mark-unread, and personal-record deletion actions.
- Canonical URL normalization and global duplicate detection.
- Source attribution and clear disclosure when metadata is unavailable.
- Responsive desktop, tablet, mobile, and print layouts.
- Loading, empty, partial-failure, and error states.
- Ingestion audit records with sanitized operational errors.

## Content-source updates

- Medium RSS is the automated V1 content source, initially covering AI, programming, software engineering, cybersecurity, startups, cloud computing, data science, and developer tools.
- Medium feeds poll every 45 minutes by default, with a configurable 30–60 minute interval.
- X content is manual-link-only in V1.
- Automated X ingestion is protected by `ENABLE_X_INGESTION=false` until an approved developer application, server-only token, spending ceiling, usage counters, and kill switch are available.
- General web links are accepted through a secure resolver. If metadata extraction fails, Marky retains a usable link-only bookmark.

## Ranking and feed behavior

- `For You` uses 65% interest relevance and 35% recency, with a 48-hour recency half-life.
- `Trending` uses 50% recency, 30% independent-source diversity, and 20% deterministic technology relevance.
- `Latest` sorts by original publication time; items with unknown dates appear afterward in ingestion order.
- Feed items explain their placement with grounded labels such as matched interests, source diversity, publication age, or unavailable publication date.

## Technical architecture

- Runtime: Node.js 22+.
- Application: Next.js App Router, React, and strict TypeScript.
- Authentication: Clerk.
- Database: Supabase Postgres with PostgreSQL row-level security.
- Validation: Zod.
- Content extraction: Mozilla Readability with sanitized HTML.
- UI: CSS design tokens, Lucide icons, and restrained Framer Motion transitions.
- Testing: Vitest plus browser end-to-end tests.
- The ingestion pipeline normalizes candidates, canonicalizes and hashes URLs, deduplicates stories, classifies topics, and persists source occurrences before ranking content.

## Data model

The V1 schema now defines these core tables:

- `profiles`
- `interests`
- `user_interests`
- `sources`
- `content_items`
- `content_item_interests`
- `content_item_sources`
- `saved_items`
- `ingestion_runs`

Required uniqueness constraints, indexes, status checks, and ownership relationships are documented. Every exposed table must have row-level security enabled.

## API contract

- `GET /api/feed` reads `for-you`, `trending`, or `latest` feeds and supports interest, read, saved, and cursor filters.
- `POST /api/submissions` securely captures a URL and optional personal note.
- `POST /api/cron/ingest` processes due sources and records per-source outcomes without allowing one failed source to stop the complete ingestion run.

## Security and privacy

- Clerk is the sole identity authority and integrates with Supabase through native third-party authentication.
- Authorization derives from the immutable Clerk token subject, not editable user metadata.
- Browser clients use only the Supabase publishable key; secret keys remain server-only.
- URL fetching blocks unsafe protocols, credentials, private and reserved network targets, unsafe redirects, oversized responses, and unexpected content types.
- Extracted HTML is allowlist-sanitized, and remote scripts, user cookies, and authorization headers are never forwarded.
- Manual submissions are rate-limited per authenticated user.

## User-experience and design updates

- Primary navigation includes Feed, Saved, Add link, and the profile menu.
- The visual system uses warm paper colors, charcoal typography, and vermillion accents.
- Editorial headings use Newsreader or Georgia; interface text uses Inter or a system sans-serif.
- Desktop uses a left navigation rail and central reading stream.
- Mobile uses a single-column layout with scrollable interest tabs.
- Print output removes controls while preserving source information and readable content.

## Delivery and quality plan

- Delivery is organized into Foundation, Content pipeline, Product workflows, and Quality/release milestones.
- Test coverage includes RSS/Atom parsing, canonicalization, ranking, security, RLS isolation, core browser workflows, accessibility, responsive layouts, and print output.
- Release requires successful linting, strict TypeScript checks, unit/integration tests, production build, clean database migrations, RLS tests, and desktop/mobile browser flows.
- Operational monitoring covers ingestion health, latency, duplicates, unknown dates, extraction failures, retries, and database/API errors.

## Deferred beyond V1

- Automated X discovery.
- Additional licensed content sources.
- Browser extensions and mobile share-sheet capture.
- AI summaries, semantic search, embeddings, and learned recommendations.
- Team workspaces, shared collections, alerts, and market dashboards.
- Subscription pricing and publisher partnerships.

## Update-log convention

For future changes, add a dated section below using this format:

```md
## YYYY-MM-DD

### Added
- New capability.

### Changed
- Updated behavior.

### Fixed
- Corrected issue.

### Known limitations
- Remaining limitation or follow-up.
```

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

### Deployment
- The scheduler now checks every 30 minutes; each source retains its own configured fetch interval.
- Live execution requires `SUPABASE_SECRET_KEY` and `CRON_SECRET` in the deployment environment.

## 2026-08-28 — Article images in live feeds

### Added
- Stored `image_url` for each content item.
- Medium RSS and Atom ingestion now extracts trusted article images from media, enclosure, and article-markup fields.
- Medium ingestion falls back to article website metadata (`og:image`, `twitter:image`, or `image_src`) when the feed does not include an image.
- Existing stored items gain an image on a later ingestion run when one becomes available.

### Security
- Only HTTPS images hosted on Medium's trusted image domains are stored and displayed.
# Medium-style Marky reader UI

- Reworked the home screen into a focused three-column reader layout inspired by the supplied Medium reference.
- Added a persistent navigation rail for Home, Library, Profile, and Discover.
- Changed the main content area to a compact, scannable article list with source, author, reading time, topic, image, save, read, and external-link actions.
- Added a right rail for topic tuning, daily story counts, and the Add link workflow.
- Added responsive tablet and mobile layouts while preserving search, filtering, saving, read state, Clerk controls, and live feed compatibility.
- Removed generic decorative image fallbacks. Marky now displays only images published by the original author or publication; articles without a publisher image render as clean text-only cards.

# Fresh and popular article ingestion

- Medium ingestion now limits new candidates to articles published during the last 30 days.
- The original article page is checked for a public clap/engagement count; unavailable counts safely fall back to zero.
- Engagement counts and the last check time are stored on `content_items` and refreshed without reducing previously observed totals.
- Trending ranking now combines freshness, public engagement, source diversity, and topic relevance.
- The live feed excludes articles older than 45 days and displays a compact engagement count when one is available.

# Adaptive personalized feed

- Added private interaction tracking for impressions, article opens, saves, unsaves, and read-state changes.
- Added per-user topic affinity scores that update atomically and ignore duplicate client events.
- `For You` now blends learned interests (38%), selected interests (22%), freshness (20%), public engagement (12%), source diversity (6%), and deterministic exploration (2%).
- Feed cards explain personalization with labels such as “Because you read Cybersecurity.”
- Interaction records and affinity scores are server-only, protected by row-level security, and never exposed directly to the browser.
- The live server remains the ranking authority so client-side filtering does not overwrite the personalized order.

# Live trending ingestion verification

- Switched the local application from demo data to the live Clerk and Supabase path.
- Ran all eight active Medium technology feeds through the scheduled backend ingestion pipeline.
- Stored 78 recent source-grounded articles in Supabase; 60 include an image published by the author or publication.
- Trending uses freshness, public engagement when Medium exposes it, topic relevance, and independent-source diversity. It is described as Marky's trend calculation rather than Medium-wide popularity.
- Articles without a publisher-provided image remain clean text-only items; Marky does not generate replacement images.

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

## 2026-09-02 — Add-link article extraction

### Fixed
- The Add link form now calls the server instead of creating a browser-only placeholder.
- Marky fetches permitted public article pages and extracts their canonical URL, title, author, summary, and publication date before saving.
- Newly added articles appear immediately in the dashboard, and saved links remain eligible for the live For You feed even when their publication date is unavailable.

### Security
- Link fetching validates public HTTP/HTTPS destinations, blocks credentials and private-network targets, revalidates redirects, limits redirect count, enforces a timeout and response-size ceiling, and accepts HTML content only.
- Live metadata fetching now happens only after the user is authenticated.

## 2026-09-02 — Queued link processing

### Changed
- Add link now returns immediately after placing a durable message on the private Supabase `link_ingestion` queue.
- A background worker extracts and persists article metadata without keeping the form open.
- Marky checks the user's protected submission status and shows an in-app notification when the article is added or processing fails.
- A one-minute recovery worker processes messages that were not completed by the immediate post-response worker.

### Security
- Queue operations are available only to the server-side service role through narrowly granted database functions.
- Submission status records use row-level security, and the status endpoint additionally verifies Clerk identity and profile ownership.
