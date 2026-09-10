# Marky Topic & Source Strategy

This document defines the official topic list, verified direct content sources, ingestion guidelines, and removal rationale for Marky.

## 1. Overview & Strategy

Marky enforces a **Source-Grounded Quality Policy**, in two tiers:

- **RELIABLE + DIRECT + TOPIC-SPECIFIC + CURRENT**
- A topic is retained **only** if it possesses an official, verified direct RSS/Atom feed maintained directly by the organization or project team. That feed is the topic's `official` tier and remains the trusted baseline every other source is measured against.
- Tag aggregations and other community sources are permitted **as a `community` tier source, never as a topic's only source**. They are admissible because every candidate is now scored by the qualification gate *before* storage (`src/lib/qualification/`), and `sources.trust_tier` feeds that score directly: `community` contributes 0.7 against `official`'s 1.0, so a community item must be more relevant and more substantial to clear the same 0.6 threshold.
- A community source **must** declare its topics in `source_topics`. Relevance is scored only against that source's declared topic aliases, which is what stops a tag feed bleeding across topics. A community source with no declared topics fails its ingestion run with `SOURCE_TOPICS_MISSING` rather than being scored against every alias.
- Web scrapers, search engine results, and keyword matching against unrelated publications remain prohibited.
- `published_at` MUST strictly preserve the original publication date provided by the direct feed (`pubDate`, `published`, `updated`).

> **Changed 2026-09-09.** This section previously prohibited tag aggregation outright. That rule
> existed because there was no quality gate: an unverified post could be stored on a source-name
> keyword match alone. The gate now exists, so the prohibition was narrowed to the conditions
> above rather than kept as a blanket ban. See §4.

---

## 2. Topic Decision Matrix

| Topic | Decision | Access Type | Verified Direct Source Endpoint | Latest Observed Content | Notes / Status |
|---|---|---|---|---|---|
| **OpenAI** | **KEEP** | RSS 2.0 | `https://openai.com/news/rss.xml` | Sep 03, 2026 | Official news/blog RSS feed |
| **Hugging Face** | **KEEP** | RSS 2.0 | `https://huggingface.co/blog/feed.xml` | Sep 03, 2026 | Official engineering & AI research blog feed |
| **NVIDIA** | **KEEP** | RSS 2.0 | `https://blogs.nvidia.com/feed/` | Sep 03, 2026 | Official corporate and developer blog feed |
| **Google / Google DeepMind** | **KEEP** | RSS 2.0 / Atom | `https://deepmind.google/blog/rss.xml` <br> `https://blog.google/rss/` | Sep 04, 2026 | Dual official feeds covering DeepMind AI & Google product engineering |
| **Vercel** | **KEEP** | RSS 2.0 | `https://vercel.com/blog/feed.xml` | Sep 04, 2026 | Official product & platform release feed |
| **Supabase** | **KEEP** | RSS 2.0 | `https://supabase.com/feed.xml` | Aug 24, 2026 | Official engineering blog feed |
| **Resend** | **KEEP** | RSS 2.0 | `https://resend.com/blog/rss.xml` | Sep 03, 2026 | Official developer blog & changelog feed |
| **Next.js** | **KEEP** | RSS 2.0 / Atom | `https://nextjs.org/feed.xml` | Sep 04, 2026 | Official framework blog feed |
| **React** | **KEEP** | RSS 2.0 | `https://react.dev/rss.xml` | Sep 03, 2026 | Official React core blog feed |
| **TypeScript** | **KEEP** | RSS 2.0 | `https://devblogs.microsoft.com/typescript/feed/` | Jul 08, 2026 | Official Microsoft TypeScript devblog feed |
| **GitHub** | **KEEP** | RSS 2.0 | `https://github.blog/feed/` | Sep 04, 2026 | Official GitHub engineering blog feed |
| **Neon** | **KEEP** | RSS 2.0 | `https://neon.tech/blog/rss.xml` | Sep 04, 2026 | Official serverless Postgres blog feed |
| **Anthropic** | **REMOVE** | N/A | None (All endpoints return 404) | N/A | No public official RSS/Atom feed exposed |
| **Grok / xAI** | **REMOVE** | N/A | None (All endpoints return 403/404) | N/A | No public official RSS/Atom feed exposed |
| **Expo** | **REMOVE** | N/A | `https://blog.expo.dev/feed` | May 2024 (>2.5 years stale) | Official feed abandoned, stale |
| **Clerk** | **REMOVE** | N/A | None (All endpoints return 404) | N/A | No public official RSS/Atom feed exposed |
| **ElevenLabs** | **REMOVE** | N/A | None (All endpoints return 404) | N/A | No public official RSS/Atom feed exposed |
| **Sarvam** | **REMOVE** | N/A | None (All endpoints return 404) | N/A | No public official RSS/Atom feed exposed |
| **LlamaIndex** | **REMOVE** | N/A | None (All endpoints return 404) | N/A | No public official RSS/Atom feed exposed |
| **Artificial Intelligence** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |
| **Programming** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |
| **Software Engineering** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |
| **Cybersecurity** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |
| **Startups** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |
| **Cloud Computing** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |
| **Data Science** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |
| **Developer Tools** | **REMOVE** | N/A | Medium Tag Feed (Disallowed) | N/A | Broad tag aggregation without direct publisher grounding |

---

## 3. Detailed Kept Topics & Sources

### Kept Topics List (11 Topics)
1. **OpenAI**
2. **Hugging Face**
3. **NVIDIA**
4. **Google / Google DeepMind**
5. **Vercel**
6. **Supabase**
7. **Resend**
8. **Next.js**
9. **React**
10. **TypeScript**
11. **GitHub**
12. **Neon**

---

## 4. Removed Topics & Rationale

16 topics were purged from Marky:
- **No Official Feed Available**: `Anthropic`, `Grok / xAI`, `Clerk`, `ElevenLabs`, `Sarvam`, `LlamaIndex`. None of these entities publish an accessible, official RSS or Atom feed.
- **Abandoned / Stale Feed**: `Expo`. The official blog RSS feed (`blog.expo.dev/feed`) has not received updates since May 2024, violating the currency requirement.
- **Generic Tag Aggregation**: `Artificial Intelligence`, `Programming`, `Software Engineering`, `Cybersecurity`, `Startups`, `Cloud Computing`, `Data Science`, `Developer Tools`. These relied on third-party Medium tag feeds (`medium.com/feed/tag/...`) which aggregated unverified third-party blog posts rather than direct official engineering publications. **These topics stay removed** — they were broad subject tags with no official publisher behind them, which is a different problem from the one the qualification gate solves.

### Medium tag feeds, reinstated 2026-09-09 as a community tier

Ten Medium tag feeds were added (`20260909020000_add_medium_tag_sources.sql`) as `community`-tier
sources attached to **existing entity topics that already have an official feed**. They supplement
that feed; they never stand in for one. They are seeded as `source_type = 'rss'` so they run
through the generic adapter and its qualification gate — not through the legacy `medium_rss`
adapter, which bypasses the gate entirely.

Two topics were deliberately left without a Medium source:

| Topic | Why not |
| --- | --- |
| **Resend** | Its only alias is the bare English word "resend". The Medium tag is dominated by "how to resend an OTP" tutorials, which would score relevance 1.0 on a title match and store junk under the topic. |
| **Neon** | The `neon` tag is neon signs, neon art and neon UI palettes, and the alias list contains the bare word "neon". Same trap. |

Both need a discovery source that is not a tag aggregation. Leaving them out is better than
poisoning two topics — the tag slug is the only filter a tag feed has, so a slug that collides
with an everyday word is not usable no matter how good the gate is.

---

## 5. Ingestion Workflow & Architectural Rules

1. **Scheduled Execution**: Ingestion runs automatically via `/api/cron/ingest` (or scheduled serverless cron).
2. **Pipeline Architecture**:
   - `Source` → `Fetch RSS/Atom` → `Parse XML` → `Extract metadata & pubDate` → `Canonicalize URL` → `Deduplicate by URL Hash` → `Associate Topics` → `Persist to Supabase`.
3. **Publication Timestamp Integrity**:
   - `published_at` MUST be populated from the RSS `<pubDate>`, `<dc:date>`, or Atom `<published>` / `<updated>` XML fields.
   - Fallbacks to `fetched_at` or `now()` are strictly forbidden. If a feed item lacks a valid date, metadata honesty rules require leaving publication timestamp unpopulated or marked as unknown.
4. **Idempotency**:
   - `url_hash` (`sha256(canonical_url)`) ensures re-fetching existing feeds updates records cleanly without producing duplicate `content_items` or `content_item_topics`.

---

## 6. Known Limitations

- **Missing Feeds for Modern AI Labs**: Key labs like Anthropic and xAI do not offer standard RSS endpoints as of late 2026. If official feeds are launched in the future, they may be onboarded following source verification.
