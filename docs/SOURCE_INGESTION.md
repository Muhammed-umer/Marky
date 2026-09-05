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

## Existing Medium implementation

Medium remains separate from generic feeds. Eight existing tag feeds (`medium_rss`) are fetched from Medium HTTPS hosts, normalized and deduplicated by canonical URL hash, classified into the broad legacy topics, and scheduled through the same protected worker. It additionally checks permitted public article pages for a trusted publisher image and a public clap count. Its dedicated tests cover RSS/Atom parsing, website metadata, and images. No Medium feed or adapter was rewritten in this change.

## Non-source configuration

The browser uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; server workers use `SUPABASE_SECRET_KEY`. The unscheduled legacy Medium Edge Function now reads the current injected `SUPABASE_SECRET_KEYS` dictionary rather than `SUPABASE_SERVICE_ROLE_KEY`. No secret is exposed or recorded here.
