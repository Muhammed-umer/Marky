# Marky: End-to-End Product and Engineering Specification

**Status:** V1 implementation specification (baseline)  
**Audience:** Product, design, frontend, backend, data, QA, and deployment engineers  
**Primary market:** Global English-language technology professionals  
**Baseline written:** 2026-08-28  
**Status note added:** 2026-09-04

> **Status note (2026-09-04).** This document is the V1 engineering baseline and
> has not been rewritten since 2026-08-28. The product direction is now defined by
> [`PRODUCT_VISION.md`](./PRODUCT_VISION.md); where the two differ, the vision wins
> for new work and this document remains the reference for security, schema, and
> API rules. The implementation has diverged from the body of this document in the
> following places. Each is recorded in [`NEW_UPDATES.md`](./NEW_UPDATES.md) and
> tracked in [`PROGRESS.md`](./PROGRESS.md).
>
> | Section | Baseline says | Implementation today |
> | --- | --- | --- |
> | §5.1, §17 M3 | Onboarding with interest selection; interest management | Not implemented. `user_interests` exists in the schema but is unused. The feed and UI use a fixed default of three interests. |
> | §6.1 | Medium RSS is the only automated source, polled every 45 minutes | Medium plus generic RSS/Atom (GitHub Blog, Cloudflare Blog, Vercel Changelog). Sources poll every 5 to 30 minutes; the scheduler runs every 5 minutes. |
> | §6.1 | Feed metadata only | Medium article pages are also fetched for a publisher image and a public clap count (30-day window). |
> | §6.2 | X URLs handled with X-specific rules | X URLs go through the generic web resolver like any other page. No X-specific handling exists. |
> | §7.1 | `for_you = 0.65 interest + 0.35 recency` | `0.38 learned affinity + 0.22 selected interest + 0.20 recency + 0.12 engagement + 0.06 diversity + 0.02 exploration`. Saved items are pinned first. |
> | §7.2 | `trending = 0.50 recency + 0.30 diversity + 0.20 relevance` | `0.40 recency + 0.35 engagement + 0.15 diversity + 0.10 relevance`. Items older than 45 days are excluded from the live feed. |
> | §8.1 | "Avoid queues and extra infrastructure" | Link submissions use a `pgmq` queue with an immediate worker and a one-minute recovery worker. |
> | §8.1, §12.1 | Cursor-based pagination | Not implemented. The feed loads the 200 newest items plus the user's saved items and returns the top 30; `nextCursor` is always `null`. |
> | §12.2 | `201 / 200 / 409` submission responses | Returns `202 { submissionId, status: "queued" }`; the client polls `GET /api/submissions/[id]`. |
> | §12.3, §17 | Vercel Cron triggers `/api/cron/ingest` | Supabase `pg_cron` + `pg_net` call `/api/cron/ingest` (5 min) and `/api/cron/process-links` (1 min) with a Vault-stored secret. |
> | §10.1 | Nine core tables | Plus `content_events`, `user_interest_affinities`, `link_submissions`, and `private.ingestion_secrets`. |
> | §14.1 | Feed, Saved, Add link, profile menu | Home, Library (saved), Profile, and Discover rail; sign-in/sign-up are Clerk-hosted rather than app routes. |
> | §16 | `ENABLE_X_INGESTION` flag | Not read anywhere in the code. X automation is absent rather than flag-gated. |
> | §18.2, §18.3 | Security and RLS test suites | Unit tests cover parsing, URL, ranking, classification, scheduler, and web-metadata behaviour. No automated SSRF-block, RLS, or browser tests exist. |

## 1. Executive Summary

Marky is a calm, personalized technology-trend reader for developers, founders,
product managers, and technology enthusiasts. It collects source-grounded
technology content, ranks it using transparent deterministic rules, and gives
users a focused place to discover, read, save, and manage useful links.

V1 automatically ingests Medium content through official RSS feeds. X content is
supported through manual URL submission only until an official X API budget and
monthly spending ceiling are approved. Marky never automates user sessions,
stores social-media cookies, or bypasses platform access controls.

Marky is not a social network, a general-purpose search engine, or an AI news
generator. Its value is reducing research noise while preserving original
sources and explaining why an item appears in a user's feed.

## 2. Product Problem

Technology professionals currently discover information across social feeds,
blogs, newsletters, and reading applications. This creates several problems:

- Important developments are mixed with unrelated entertainment and promotion.
- The same story appears repeatedly under different tracking URLs.
- Platform ranking algorithms are opaque and optimized for engagement.
- Saved links become an unorganized backlog.
- Users cannot easily distinguish recent content from genuinely relevant content.
- Aggregators sometimes remove context or fail to preserve source attribution.

Marky addresses these problems with a narrow technology focus, deterministic
personalization, canonical URL deduplication, explicit source attribution, and a
quiet editorial interface.

## 3. Market Position

The market contains three adjacent product categories:

| Category | Examples | Strength | Marky's position |
| --- | --- | --- | --- |
| Read-it-later | Readwise Reader, Matter | Rich personal reading libraries | Technology discovery plus lightweight saving |
| Feed monitoring | Inoreader, Feedly | Large source catalogs and rules | Curated, simpler, technology-specific feed |
| Market intelligence | Feedly Market Intelligence | Enterprise analysis and dashboards | Accessible personal intelligence without enterprise complexity |

Marky's initial differentiation is:

- Technology-only discovery rather than a general news inbox.
- Transparent ranking based on interests, recency, and source diversity.
- A content-first experience without social mechanics or advertising clutter.
- Grounded metadata and direct links to original publishers.
- One workflow for discovery, manual link capture, read state, and bookmarks.

## 4. Target Users and Jobs

### 4.1 Primary users

- Software engineers tracking tools, frameworks, cloud platforms, and security.
- Founders tracking startups, product launches, funding, and market shifts.
- Product managers tracking customer-facing technologies and product strategy.
- Technology enthusiasts maintaining a high-quality reading queue.

### 4.2 Core jobs to be done

1. Show me the most relevant recent technology content without unrelated noise.
2. Explain why an article is relevant to my selected interests.
3. Let me save a useful X or web link while preserving its source.
4. Prevent the same story from occupying multiple feed positions.
5. Let me return to unread and saved material quickly.

## 5. V1 Scope

### 5.1 Included

- Clerk authentication with Google, LinkedIn, and verified email/password.
- Onboarding with technology-interest selection.
- Automated Medium RSS ingestion.
- Manual submission of HTTP/HTTPS URLs, including public X post URLs.
- Deterministic topic classification using curated keywords and feed metadata.
- `For You`, `Trending`, and `Latest` feed views.
- Filtering by interest, read state, and saved state.
- Save, unsave, mark read, mark unread, and delete personal saved records.
- Canonical URL normalization and duplicate detection.
- Source attribution, original links, and missing-metadata disclosure.
- Responsive desktop, tablet, mobile, and print layouts.
- Loading, empty, partial-failure, and error states.
- Ingestion audit records and sanitized operational errors.

### 5.2 Excluded

- AI summaries, generated rewrites, embeddings, and semantic search.
- Automated X discovery until API spending is explicitly approved.
- Instagram, LinkedIn-post, Facebook, TikTok, or Reddit ingestion.
- Comments, likes, public profiles, following, or shared public feeds.
- Folders, nested tags, and collaborative collections.
- Native mobile applications and push notifications.
- Financial price data, investment recommendations, or trading functionality.
- Publisher paywall bypassing or storage of content Marky is not permitted to retain.

## 6. Source Strategy

### 6.1 Medium

Use Medium's supported RSS feeds for topics, publications, and writers. Seed the
following global English topics:

- Artificial intelligence
- Programming
- Software engineering
- Cybersecurity
- Startups
- Cloud computing
- Data science
- Developer tools

Each source record contains its feed URL, site URL, active state, fetch interval,
last successful fetch, conditional request metadata, and last sanitized error.
Default polling frequency is 45 minutes, configurable per source between 30 and
60 minutes.

RSS is the source of truth for title, author, publication time, canonical link,
categories, and available summary or body. Marky must not fabricate missing
fields. Paywalled entries remain previews linking to Medium.

### 6.2 X

V1 accepts user-submitted public URLs matching `x.com` or `twitter.com`. Marky
stores the normalized URL, user note, submission time, and only metadata that can
be obtained through a permitted public response. If metadata is unavailable, the
item remains a valid bookmark with `Unknown author` and `Date unknown` labels.

The official X source adapter exists behind `ENABLE_X_INGESTION=false`. It must
not call X until all of the following are configured:

1. An approved X developer application.
2. A server-only API token.
3. A documented monthly spending ceiling.
4. Request and resource-read counters.
5. A kill switch that immediately disables scheduled X ingestion.

### 6.3 Manual web URLs

Authenticated users can submit public HTTP/HTTPS links. The server validates the
destination against SSRF rules, follows a limited number of safe redirects,
enforces response-size and timeout limits, and extracts permitted metadata.
Unextractable pages remain link-only bookmarks rather than failing completely.

## 7. Feed Behavior

### 7.1 For You

Ranks items by user-interest relevance and recency:

```text
for_you_score = (0.65 * interest_score) + (0.35 * recency_score)
```

- `interest_score` is the proportion of classified item interests that match the
  user's selected interests.
- `recency_score` uses exponential decay based on original publication time with
  a 48-hour half-life.
- Unknown publication dates receive a zero recency score and are not silently
  treated as new.

### 7.2 Trending

Ranks recent technology stories by recency and independent-source diversity:

```text
trending_score =
  (0.50 * recency_score) +
  (0.30 * diversity_score) +
  (0.20 * technology_relevance_score)
```

- `diversity_score` counts distinct feeds or publications referencing the same
  canonical story within seven days and normalizes the count to `0..1`.
- `technology_relevance_score` is deterministic topic coverage, not an AI score.
- Items without original publication time are excluded.
- The UI describes this as Marky's trending calculation, never as Medium-wide or
  X-wide popularity.

### 7.3 Latest

Orders items strictly by original `published_at` descending. Unknown-date items
follow dated items and are sorted by ingestion time.

### 7.4 Explanation labels

Each item displays one or more grounded labels:

- `Matches Artificial Intelligence`
- `Matches Cybersecurity`
- `From 3 tracked sources`
- `Published 4 hours ago`
- `Publication date unavailable`

## 8. Technology Stack

| Layer | Technology | Usage |
| --- | --- | --- |
| Runtime | Node.js 22+ | Server routes, ingestion, build tooling |
| Web framework | Next.js App Router, React, strict TypeScript | UI, server components, route handlers |
| Authentication | Clerk | Identity, sessions, OAuth, password flows |
| Database | Supabase Postgres | Relational domain data and ingestion state |
| Authorization | PostgreSQL RLS | Database-enforced ownership and access |
| Data access | `@supabase/supabase-js` v2 | Browser and server database clients |
| Validation | Zod | Environment, request, and adapter validation |
| Feed parsing | Maintained XML/RSS parser | RSS 2.0 and Atom normalization |
| Extraction | Mozilla Readability plus sanitized HTML | Permitted article metadata extraction |
| Styling | CSS Modules/global design tokens | Warm editorial design system |
| Icons | Lucide React | Accessible interface icons |
| Motion | Framer Motion | Restrained transitions and feedback |
| Testing | Vitest plus browser end-to-end testing | Logic, API, security, and workflows |

### 8.1 Efficiency rules

- Fetch independent sources concurrently with a fixed limit of four.
- Use `ETag` and `Last-Modified` conditional requests where supported.
- Store URL hashes and indexed publication timestamps.
- Perform cursor-based pagination instead of large offset queries.
- Keep ranking weights in one typed configuration module.
- Cache normalized public feed results, never user-specific authorization results.
- Avoid queues and extra infrastructure until ingestion volume requires them.
- Use server components for initial reads and server actions for internal UI
  mutations; retain required REST endpoints for the documented public contract.

## 9. System Architecture

```text
Medium RSS feeds             Manual user URL
       |                            |
       v                            v
Medium adapter              Secure URL resolver
       |                            |
       +----------+-----------------+
                  v
        ContentCandidate validation
                  |
                  v
   Canonicalization and SHA-256 hashing
                  |
                  v
       Deduplication and topic matching
                  |
                  v
            Supabase Postgres
                  |
          +-------+--------+
          v                v
    Feed ranking      Saved/read state
          +-------+--------+
                  v
          Next.js application
```

### 9.1 Adapter contract

```ts
interface SourceAdapter {
  fetch(source: Source, cursor?: string): Promise<FetchResult>;
}

interface FetchResult {
  items: ContentCandidate[];
  cursor?: string;
  etag?: string;
  lastModified?: string;
}
```

`ContentCandidate` contains source ID, optional external ID, canonical URL,
title, author, published time, publication-time status, summary, sanitized body,
and topic hints. Adapters never write directly to the database.

## 10. Database Model

### 10.1 Core tables

- `profiles`: Clerk subject, email, name, avatar, onboarding status, timestamps.
- `interests`: controlled topic vocabulary with name, slug, and description.
- `user_interests`: user-to-interest ownership junction.
- `sources`: source identity, type, URLs, polling state, conditional request data,
  active flag, interval, last fetch, and last error.
- `content_items`: canonical content record with URL hash, source, external ID,
  grounded metadata, sanitized content, publication status, and fetch time.
- `content_item_interests`: deterministic content-to-interest classifications.
- `content_item_sources`: records every source occurrence of a canonical story,
  enabling diversity scoring after global deduplication.
- `saved_items`: user ownership, content item, read state, optional note, and save
  timestamp with a unique `(user_id, content_item_id)` constraint.
- `ingestion_runs`: source, status, timing, fetched/inserted/duplicate counts, and
  sanitized error code.

### 10.2 Required indexes and constraints

- Unique `profiles.clerk_user_id`.
- Unique `interests.slug` and `interests.name`.
- Unique global `content_items.url_hash`.
- Unique `(source_id, external_id)` where external ID is present.
- Unique junction-table composite keys.
- Indexes on `content_items.published_at`, `content_items.fetched_at`, source IDs,
  interest IDs, saved user IDs, and ingestion start time.
- Check constraints for source type, publication-time status, ingestion status,
  and positive fetch intervals.

## 11. Authentication and Authorization

Clerk is the only user identity authority. Supabase uses its current native Clerk
third-party authentication integration; the deprecated shared JWT-secret template
must not be used.

RLS ownership derives from the immutable Clerk token subject (`auth.jwt()->>'sub'`)
and resolves it to `profiles.clerk_user_id`. Authorization must never depend on
user-editable metadata.

### 11.1 RLS policy intent

- Profiles: users can select and update only their own row.
- Interests: authenticated users can select; only server ingestion/admin can write.
- User interests: users can select, insert, and delete only their own mappings.
- Sources and content: authenticated users can select; only server code can write.
- Saved items: users can select, insert, update, and delete only their own rows.
- Ingestion runs: server-only access.

Every exposed table has RLS enabled. Database grants and RLS policies are defined
together. Browser clients use only the publishable key. The Supabase secret key
is server-only and is never combined with a user access token.

## 12. API Contract

### 12.1 Read feed

```http
GET /api/feed?view=for-you|trending|latest
  &interest=<slug>
  &read=all|read|unread
  &saved=true|false
  &cursor=<opaque>
```

Returns feed items, deterministic score explanations, and an opaque next cursor.
Invalid filters return `400`; unauthenticated production requests return `401`.

### 12.2 Submit URL

```http
POST /api/submissions
Content-Type: application/json

{
  "url": "https://x.com/example/status/123",
  "note": "Optional personal context"
}
```

Returns `201` for a newly created item, `200` for an existing canonical item that
was newly saved, `409` only when the same user already saved the item, and safe
validation errors without internal network or parsing details.

### 12.3 Scheduled ingestion

```http
POST /api/cron/ingest
Authorization: Bearer <CRON_SECRET>
```

The route processes due active sources, records individual source outcomes, and
returns aggregate counts. One source failure does not fail other source jobs.

## 13. URL and Content Security

- Accept only `http:` and `https:` URLs.
- Reject embedded credentials and nonstandard ports unless explicitly approved.
- Resolve DNS and block loopback, link-local, private, multicast, and reserved IPs.
- Revalidate every redirect destination and limit redirects to three.
- Set connection and total request timeouts.
- Enforce response size before and during streaming.
- Accept only expected HTML or feed content types.
- Sanitize extracted HTML using an allowlist before storage or rendering.
- Never execute remote scripts or forward user cookies and authorization headers.
- Rate-limit manual submissions by authenticated user.
- Sanitize operational errors before storing them in `sources` or `ingestion_runs`.

## 14. User Experience

### 14.1 Information architecture

- Primary navigation: Feed, Saved, Add link, and profile menu.
- Feed tabs: For You, Trending, and Latest.
- Interest filter: All Interests plus selected topics.
- State filter: All Items, Unread Only, and Read Only.

### 14.2 Feed item

Each feed item includes source, author, publication time or explicit unknown state,
serif title, short source-provided excerpt, relevance labels, original-link action,
save control, and read-state control. Controls use familiar Lucide icons with
accessible names and tooltips where needed.

### 14.3 Design system

- Primary paper: `#FBF9F5`
- Secondary paper: `#F4F0EA`
- Surface: `#FFFFFF`
- Primary charcoal: `#1F1F1F`
- Muted charcoal: `#57534E`
- Vermillion: `#E03E2F`
- Vermillion hover: `#C4321A`
- Border: `#E6E2DA`
- Editorial headings: Newsreader or Georgia fallback.
- Interface and body: Inter or system sans-serif fallback.
- Cards use no more than an 8px radius and are not nested.

Desktop uses a compact left navigation rail and a readable central stream. Mobile
uses a single-column stream with a stable header and horizontally scrollable
interest tabs. Print styles remove navigation and controls while preserving title,
source, author, canonical URL, and readable body text.

## 15. Error and Empty States

- Loading: stable-dimension editorial skeletons.
- No interests: prompt the user to select at least one topic.
- No matching feed items: retain filters visibly and provide a clear reset action.
- Source partially unavailable: show existing content with a non-blocking status.
- Submission metadata unavailable: save the URL and note with an explicit label.
- Authentication expired: return to sign-in without discarding a typed URL where
  browser safety permits.

## 16. Environment Configuration

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
ENABLE_X_INGESTION=false
NEXT_PUBLIC_DEMO_MODE=false
```

Production must reject startup when required credentials are absent. Demo mode is
allowed only for local development and automated UI verification; it must display
a clear demo-data indicator and must never be enabled in production.

## 17. Delivery Plan

### Milestone 1: Foundation

- Initialize Next.js, strict TypeScript, linting, tests, and environment validation.
- Configure Clerk and native Clerk-to-Supabase third-party authentication.
- Create database migrations, explicit grants, RLS policies, and seeded interests.
- Establish design tokens, responsive shell, and authentication states.

### Milestone 2: Content pipeline

- Implement adapter types, Medium RSS parser, validation, and retry policy.
- Add safe URL canonicalization, global deduplication, and source occurrences.
- Implement deterministic topic matching and ingestion audit records.
- Protect and schedule the ingestion endpoint.

### Milestone 3: Product workflows

- Implement onboarding and interest management.
- Add For You, Trending, and Latest queries with cursor pagination.
- Add feed filters, save/read mutations, and optimistic feedback.
- Implement safe manual URL and X-link submission.

### Milestone 4: Quality and release

- Complete loading, empty, error, responsive, accessibility, and print states.
- Verify RLS with multiple identities and all table operations.
- Run unit, integration, security, browser, lint, typecheck, and production builds.
- Document deployment, cron configuration, operational limits, and rollback.

## 18. Test and Acceptance Plan

### 18.1 Unit tests

- RSS 2.0 and Atom parsing, malformed XML, missing optional metadata.
- URL normalization and removal of `utm_*`, `ref`, `fbclid`, and fragments.
- SHA-256 determinism and duplicate handling.
- Interest classification, recency decay, diversity score, and stable tie-breaking.
- Unknown-date exclusion from Trending.

### 18.2 Security tests

- Block localhost, IPv4/IPv6 private ranges, link-local addresses, and unsafe ports.
- Block safe-looking URLs that redirect to private destinations.
- Reject unsupported protocols, embedded credentials, oversized content, and timeouts.
- Verify stored and rendered HTML cannot execute scripts or event handlers.
- Verify cron access without the correct secret returns `401`.

### 18.3 RLS tests

Using two different Clerk subjects, prove that each user cannot read or mutate the
other user's profile, interests, saved items, notes, or read state. Verify anonymous
access is denied and authenticated content reads are allowed as designed.

### 18.4 Browser flows

- Sign in, onboard, choose interests, and edit interests.
- Switch between For You, Trending, and Latest.
- Apply and reset interest/read/saved filters.
- Save, unsave, mark read, and mark unread.
- Submit a normal article and public X URL.
- Verify duplicate, missing-metadata, empty, error, and partial-failure states.
- Verify desktop and mobile layouts, keyboard navigation, and print output.

### 18.5 Release gates

- TypeScript passes with no `any` types.
- ESLint passes without errors.
- Unit and integration tests pass.
- Production build succeeds.
- Database migrations apply cleanly from an empty project.
- RLS tests pass for allow and deny cases.
- Browser workflows pass at desktop and mobile sizes.
- `PROGRESS.md` records commands, results, known limits, and next actions.

## 19. Operational Monitoring

Monitor ingestion success rate, source latency, items fetched, inserts, duplicates,
unknown-date frequency, extraction failures, and retry exhaustion. Do not store raw
secrets, response bodies, user notes, or full URLs containing sensitive query data
in operational logs.

Alert when a source fails three consecutive scheduled runs, ingestion produces no
new content across all active feeds for six hours, or database/API errors exceed a
defined threshold. X usage and spending monitoring is required before its adapter
can be enabled.

## 20. Definition of Done

Marky V1 is complete when an authenticated global-English user can select interests,
receive a deduplicated personalized Medium feed, view transparent For You/Trending/
Latest ordering, save and manage reading state, submit a permitted web or X link,
and use the experience on mobile and desktop. All displayed data must remain tied
to an original source, all missing metadata must be disclosed, and all release gates
in this specification must pass.

## 21. Future Considerations

The following require a separate V2 decision and must not enter V1 implicitly:

- Official automated X discovery with explicit cost controls.
- Additional licensed or official content sources.
- Browser extension and mobile share-sheet capture.
- AI-assisted summaries with source-grounding evaluation.
- Semantic search, embeddings, and recommendation learning.
- Team workspaces, shared collections, alerts, and market dashboards.
- Subscription pricing and publisher partnerships.
