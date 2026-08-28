# Marky — New Updates

**Document date:** 2026-08-28  
**Source:** `MARKY_PROJECT_SPEC.md`  
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
