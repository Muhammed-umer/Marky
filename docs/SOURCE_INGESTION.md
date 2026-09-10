# Source ingestion

**Reviewed:** 2026-09-04  
**Scope:** the requested technology ecosystem. This is an implementation record, not a source roadmap.

## How configured sources work

`sources` configuration selects an adapter. `medium_rss` retains its existing Medium-specific metadata workflow; `rss` uses the generic RSS/Atom adapter. That adapter validates a public HTTPS feed URL, rejects redirects, enforces XML content types, a 12-second timeout and a 2 MB body limit, parses/normalizes entries, canonicalizes URLs, globally deduplicates by `url_hash`, classifies matching interests, and persists the item plus its source association. The protected Supabase scheduler invokes the worker every five minutes; each source has a 30-minute fetch interval and conditional ETag/Last-Modified requests.

Items without a parseable original publication date are not automatically ingested by the RSS adapter. This makes their missing date explicit and prevents `fetched_at` from being treated as publication recency. The feed orders dated content by `content_items.published_at`; saved items remain available independently.

The entries marked **configured** are in migration `20260904101524_source_ingestion_ecosystem.sql` (or, for GitHub and Vercel, the preceding multi-source seed migration). Endpoint responses and XML content types were checked on 2026-09-04. A deployed run still requires applying migrations and supplying the existing production credentials/Vault settings; it has not been claimed as live-database verified here.

## Requested sources

### OpenAI

- **What / content:** product announcements, research, safety, and developer updates.
- **Current access / RSS:** RSS available; **configured** at `https://openai.com/news/rss.xml` as `OpenAI News`.
- **Ingestion / topics / updates:** generic RSS; source name and OpenAI terms map to `OpenAI` (with any relevant broad topics); 30-minute conditional polling.
- **Limitations:** only what the News feed publishes; no private API data.
- **Verification source:** [OpenAI News RSS](https://openai.com/news/rss.xml).

### Anthropic

- **What / content:** Claude, API, research, and safety announcements.
- **Current access / RSS:** official API exists for model inference, not editorial discovery; RSS/Atom unavailable or unverified. **Not integrated.**
- **Ingestion / topics / updates:** no source row or polling. The `Anthropic` interest and classifier rule are ready for submitted or future supported-source content.
- **Limitations:** no guessed feed or undocumented extraction is used.
- **Verification source:** [Anthropic API documentation](https://docs.anthropic.com/en/api/getting-started), [Anthropic news](https://www.anthropic.com/news).

### Grok / xAI

- **What / content:** Grok and xAI product, model, and developer announcements.
- **Current access / RSS:** the official xAI API is an inference API; no verified official editorial RSS/Atom or content-discovery API. **Not integrated.**
- **Ingestion / topics / updates:** no X scraping, source row, or polling. `Grok / xAI` is an available classifier topic.
- **Limitations:** X/xAI is intentionally separate from normal feeds; API access, pricing, and a budget/kill-switch policy are needed before a supported integration.
- **Verification source:** [xAI API overview](https://docs.x.ai/docs/overview), [xAI](https://x.ai/).

### Hugging Face

- **What / content:** library releases, model ecosystem posts, research, and platform tutorials.
- **Current access / RSS:** RSS available; **configured** at `https://huggingface.co/blog/feed.xml` as `Hugging Face Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `Hugging Face`; 30-minute conditional polling.
- **Limitations:** blog posts only, not Hub model/repository events.
- **Verification source:** [Hugging Face Blog RSS](https://huggingface.co/blog/feed.xml).

### NVIDIA

- **What / content:** accelerated computing, AI, CUDA, and engineering announcements.
- **Current access / RSS:** RSS available; **configured** at `https://blogs.nvidia.com/feed/` as `NVIDIA Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `NVIDIA`; 30-minute conditional polling.
- **Limitations:** broad corporate feed may include material outside Marky's topics; classifier links only matching topics.
- **Verification source:** [NVIDIA Blog RSS](https://blogs.nvidia.com/feed/).

### Google / Google DeepMind

- **What / content:** Google AI, Gemini, developer, and DeepMind-adjacent announcements.
- **Current access / RSS:** Google Blog RSS available; **configured** at `https://blog.google/rss/` as `Google Blog`. A distinct verified Google DeepMind RSS endpoint was not found, so no DeepMind-specific feed is configured.
- **Ingestion / topics / updates:** generic RSS; terms map to `Google / Google DeepMind`; 30-minute conditional polling.
- **Limitations:** the general Google feed is not an exhaustive DeepMind feed.
- **Verification source:** [Google Blog RSS](https://blog.google/rss/), [Google DeepMind blog](https://deepmind.google/discover/blog/).

### Vercel

- **What / content:** Vercel platform, product, framework, and changelog updates.
- **Current access / RSS:** Atom available; **already configured** at `https://vercel.com/atom` as `Vercel Changelog`.
- **Ingestion / topics / updates:** generic Atom; terms map to `Vercel` and may also map to `Next.js`; 30-minute conditional polling.
- **Limitations:** existing source name is retained for migration compatibility even though the Atom endpoint may cover more than changelog entries.
- **Verification source:** [Vercel Atom feed](https://vercel.com/atom).

### Supabase

- **What / content:** product releases, database platform, and engineering posts.
- **Current access / RSS:** RSS/Atom unavailable or unverified at the official blog location. **Not integrated.**
- **Ingestion / topics / updates:** no source row or polling; `Supabase` is available for classified submitted content and future supported access.
- **Limitations:** no guessed `/rss.xml` endpoint is used.
- **Verification source:** [Supabase Blog](https://supabase.com/blog).

### Resend

- **What / content:** email platform releases, technical posts, and developer updates.
- **Current access / RSS:** RSS available; **configured** at `https://resend.com/blog/rss.xml` as `Resend Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `Resend`; 30-minute conditional polling.
- **Limitations:** only published blog content is collected.
- **Verification source:** [Resend Blog RSS](https://resend.com/blog/rss.xml).

### Next.js

- **What / content:** framework releases, technical announcements, and guides.
- **Current access / RSS:** RSS available; **configured** at `https://nextjs.org/feed.xml` as `Next.js Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `Next.js`; 30-minute conditional polling.
- **Limitations:** documentation reference changes are not a separate feed.
- **Verification source:** [Next.js RSS](https://nextjs.org/feed.xml).

### React

- **What / content:** React releases, proposals, and technical guidance.
- **Current access / RSS:** RSS available; **configured** at `https://react.dev/rss.xml` as `React Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `React`; 30-minute conditional polling.
- **Limitations:** React documentation changes are not separately ingested.
- **Verification source:** [React RSS](https://react.dev/rss.xml).

### Expo

- **What / content:** Expo and React Native platform, SDK, and tooling updates.
- **Current access / RSS:** RSS/Atom unavailable or unverified. The commonly guessed `https://expo.dev/blog/feed.xml` returned HTML during review, so it is not configured. **Not integrated.**
- **Ingestion / topics / updates:** no source row or polling; `Expo` remains available for classification.
- **Limitations:** no non-feed extraction was added.
- **Verification source:** [Expo Blog](https://expo.dev/blog).

### TypeScript

- **What / content:** language releases, compiler, tooling, and team announcements.
- **Current access / RSS:** RSS available from the official TypeScript team's Microsoft Developer Blogs publication; **configured** at `https://devblogs.microsoft.com/typescript/feed/` as `TypeScript Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `TypeScript`; 30-minute conditional polling.
- **Limitations:** publication is hosted by Microsoft, not a separate `typescriptlang.org` feed.
- **Verification source:** [TypeScript Blog RSS](https://devblogs.microsoft.com/typescript/feed/).

### GitHub

- **What / content:** GitHub product, Actions, Copilot, security, and engineering news.
- **Current access / RSS:** RSS available; **already configured** at `https://github.blog/feed/` as `GitHub Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `GitHub`; 30-minute conditional polling.
- **Limitations:** blog content only; repository activity is not collected.
- **Verification source:** [GitHub Blog RSS](https://github.blog/feed/).

### Clerk

- **What / content:** authentication product and developer updates.
- **Current access / RSS:** Clerk Backend API manages identity data, not editorial content; RSS/Atom unavailable or unverified. **Not integrated.**
- **Ingestion / topics / updates:** no source row or polling; `Clerk` is available for classification.
- **Limitations:** no use of customer/authentication APIs for content acquisition.
- **Verification source:** [Clerk documentation](https://clerk.com/docs), [Clerk Blog](https://clerk.com/blog).

### Neon

- **What / content:** serverless Postgres releases, platform, and technical posts.
- **Current access / RSS:** RSS available; **configured** at `https://neon.com/blog/rss.xml` as `Neon Blog`.
- **Ingestion / topics / updates:** generic RSS; terms map to `Neon`; 30-minute conditional polling.
- **Limitations:** blog posts only.
- **Verification source:** [Neon Blog RSS](https://neon.com/blog/rss.xml).

### ElevenLabs

- **What / content:** AI audio, voice, API, and product announcements.
- **Current access / RSS:** RSS/Atom unavailable or unverified. **Not integrated.**
- **Ingestion / topics / updates:** no source row or polling; `ElevenLabs` is available for classification.
- **Limitations:** no undocumented API or extraction was added.
- **Verification source:** [ElevenLabs Blog](https://elevenlabs.io/blog), [ElevenLabs API docs](https://elevenlabs.io/docs/api-reference/introduction).

### Sarvam

- **What / content:** Sarvam AI models, products, and developer announcements.
- **Current access / RSS:** RSS/Atom unavailable or unverified. **Not integrated.**
- **Ingestion / topics / updates:** no source row or polling; `Sarvam` is available for classification.
- **Limitations:** no guessed endpoint or unofficial extraction is used.
- **Verification source:** [Sarvam](https://www.sarvam.ai/).

### LlamaIndex

- **What / content:** LlamaIndex framework, agent, data, and product updates.
- **Current access / RSS:** RSS/Atom unavailable or unverified. **Not integrated.**
- **Ingestion / topics / updates:** no source row or polling; `LlamaIndex` is available for classification.
- **Limitations:** no scraping or third-party aggregator is used.
- **Verification source:** [LlamaIndex Blog](https://www.llamaindex.ai/blog), [LlamaIndex documentation](https://docs.llamaindex.ai/).

## Medium (updated 2026-09-09)

Medium content is ingested by the **generic RSS adapter**, not by the `medium_rss` adapter.

Ten Medium tag feeds are seeded as `source_type = 'rss'` with `trust_tier = 'community'`, so they
inherit the generic path in full: `assertPublicHttpUrl` with a capped manual redirect loop,
content-type validation, the qualification gate with every verdict logged to
`discovery_candidates`, in-run near-duplicate detection, and `source_topics`-scoped relevance.
Their `fetch_interval_minutes` is 60 with `max_article_age_days` of 14, and their first fetch times
are staggered so they do not all fall due on one cron tick.

`canonicalizeUrl` strips Medium's `?source=rss----<feed id>` stamp, so one post reached through two
tag feeds resolves to a single `url_hash` instead of being stored twice.

### Source-page enrichment (all `rss` sources, not only Medium)

A feed entry is a teaser for the page. Medium truncates member-only stories in
`content:encoded`; several official feeds ship only a summary; many carry no image. For a
**new** entry with no image or a body under the 400-word substance bar, the generic adapter now
fetches the source page — through `fetchWebMetadata`, the same SSRF-checked, size-capped,
redirect-limited fetch the submission worker and backfill use — and fills image (`og:image`,
JSON-LD, `twitter:image`), body (Readability), author and summary **before** the item is scored.
The feed keeps precedence for anything it stated; the page only fills gaps, except that the
longer body wins. At most 12 fetches per source run, four concurrent; a failed fetch keeps the
feed's version and never fails the run. The decision and merge are pure and tested
(`src/lib/ingestion/enrich.ts`).

### The legacy `medium_rss` adapter is unused (updated 2026-09-09)

`src/lib/ingestion/medium.ts` is still dispatched for `source_type = 'medium_rss'`, but **no source
uses that type**, so the path is unreachable. Medium tag feeds were routed to the generic adapter
instead because this one skipped the quality gate entirely.

It **now calls `qualifyCandidate` and logs every verdict to `discovery_candidates`**, so seeding a
`medium_rss` source is no longer a way to bypass the gate. What it still does not do: it ignores
`source_topics` and `max_article_age_days`, and uses `redirect: "follow"` with a host allowlist
rather than the DNS-level SSRF check. Its clap-count extraction (`engagementCountFromHtml`) is
exported and tested but never called. It, the `medium_rss` enum value, and
`supabase/functions/ingest-medium/` remain candidates for removal once the new path is proven live.

## Discovery sources (added 2026-09-10)

Everything above is a **publisher announcing its own work**. A discovery source instead reports
what other people are publishing or reacting to, which is the one signal an RSS feed can never
carry — and it is what makes `content_item_signals`, and therefore Trending, real rather than a
recency sort.

This reverses the prohibition on search and community sources recorded earlier in this file. The
reason for that ban was the absence of a quality gate; that reason no longer holds.

### One interface, one pipeline

Discovery answers "where is the URL"; extraction answers "what is on it". Keeping them apart is
what makes a new platform a mapping function plus a config row rather than a new scraper.

`src/lib/ingestion/discovery.ts` owns everything after the fetch — extraction, qualification,
storage, signals, topic links, run bookkeeping — and is identical for every platform. An adapter
supplies only what differs: a `fetchHits` function, a `platform` for engagement normalisation,
whether the page needs fetching (`enrichFromPage`), and an optional quota bucket. Adding a source
of an existing platform is a database row alone.

Every discovery source **must** have a `source_topics` row. Without one it would be scored against
every alias in the table and would attach anything it found to any topic. This is enforced twice:
`runDiscoverySource` throws `SOURCE_TOPICS_MISSING`, and the seed migration fails on an orphan.

| Platform | `source_type` | Configured by | Engagement | Page fetched? |
| --- | --- | --- | --- | --- |
| Hacker News (Algolia) | `hacker_news` | `discovery_query` = search term | points (scored), points + comments (stored) | yes |
| DEV.to | `dev_to` | `discovery_query` = tag | reactions + comments | yes |
| Stack Exchange | `stack_exchange` | `discovery_query` = tag, site from `site_url` | score + answers | no — `withbody` returns the question |
| GitHub releases | `github_releases` | `discovery_query` = `owner/repo` | release reactions | no — the notes are the article |
| YouTube | `youtube` | channel id in `feed_url` | views + likes | no — a watch page has no article |

`min_engagement` tunes each source's floor without a deploy. GitHub releases deliberately ignore
it: a release is news because it shipped, and GitHub reports no reactions for most of them.

### Attribution

`author` is left null wherever the platform reports somebody who is not the author: a Hacker News
submitter, a Stack Exchange asker (the value of a question is its answers), and whoever cut a
GitHub release. DEV.to and YouTube do report the real author, and there it is kept. A
plausible-looking wrong byline is worse than an honest missing one.

A cross-posted DEV.to article is stored under its `canonical_url`, not DEV's copy.

### The quota ledger

Stack Exchange allows 300 requests per IP per day unauthenticated; GitHub allows 60 per hour. Those
budgets are shared by every source of that type, so the count lives in `public.discovery_quota` and
is spent through `consume_discovery_quota`, which takes a row lock — two sources of one platform
run concurrently inside a single cron tick and could otherwise both spend the last slot.

Budgets are set below the published ceilings (200/day and 40/hour) because the IP may not be
Marky's alone, and going over costs a block that takes out every source of that type. Quota is
spent **before** the request: overcounting a failed request costs one slot, undercounting risks the
block. A ledger that cannot be read is treated as exhausted, so a broken migration degrades to "no
discovery" rather than to "unlimited requests". DEV.to and YouTube publish no limit and are not
metered.

### Seeded coverage, and what is deliberately absent

DEV.to and Stack Exchange skip **Resend** and **Neon** for the reason the Medium seed gave: their
names are bare English words, so the tag is full of "how to resend an OTP" and neon UI palettes.
Both are covered by GitHub releases instead, where an `owner/repo` slug has no such ambiguity.

**Google / Google DeepMind** has no discovery source at all. There is no DEV or Stack Exchange tag
for the topic, and no single repository represents it — DeepMind's work ships as papers and the
`google` org is thousands of unrelated projects. It keeps its official blog feeds.

**No YouTube source is seeded.** The channel feed accepts only a `UC…` channel id — not a handle,
not a name — and a wrong id returns an empty feed rather than an error, so a guessed id produces a
source that silently finds nothing for ever. The adapter, source type and constraints are in place;
the migration carries a worked `INSERT` for adding a channel once its id has been read from the
live channel page. No deploy is needed.

## Non-source configuration

The browser uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; server workers use `SUPABASE_SECRET_KEY`. The unscheduled legacy Medium Edge Function now reads the current injected `SUPABASE_SECRET_KEYS` dictionary rather than `SUPABASE_SERVICE_ROLE_KEY`. No secret is exposed or recorded here.
