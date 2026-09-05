# Marky Topic & Source Strategy

This document defines the official topic list, verified direct content sources, ingestion guidelines, and removal rationale for Marky.

## 1. Overview & Strategy

Marky enforces a strict **Source-Grounded Quality Policy**:
- **RELIABLE + DIRECT + TOPIC-SPECIFIC + CURRENT**
- A topic is retained **only** if it possesses an official, verified direct RSS/Atom feed maintained directly by the organization or project team.
- Generic third-party tag aggregations (e.g. Medium tag feeds), web scrapers, search engine results, and keyword matching against unrelated publications are explicitly prohibited as standalone topic sources.
- `published_at` MUST strictly preserve the original publication date provided by the direct feed (`pubDate`, `published`, `updated`).

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
- **Generic Tag Aggregation**: `Artificial Intelligence`, `Programming`, `Software Engineering`, `Cybersecurity`, `Startups`, `Cloud Computing`, `Data Science`, `Developer Tools`. These relied on third-party Medium tag feeds (`medium.com/feed/tag/...`) which aggregated unverified third-party blog posts rather than direct official engineering publications.

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
