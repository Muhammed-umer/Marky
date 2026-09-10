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

## 2026-09-10 — Cleaning up what the gates were added too late to stop

### Added
- **`POST /api/cron/purge-language`** — the counterpart to `/api/cron/dedupe` for the language
  rule. `src/lib/language-purge.ts` is pure and unit-tested; it calls the same
  `isLikelyNonEnglish` the ingest gate calls rather than restating the rule, so cleanup and
  prevention cannot drift apart. Dry run by default, like the dedupe tool, and unscheduled: both
  are operator tools run by hand with the cron secret.
- A non-English row a reader **saved or submitted is never deleted** — it is reported as retained
  instead. The gate filters what Marky chose to discover; it does not overrule what a reader chose
  for themselves, and `saved_items.content_item_id` is ON DELETE CASCADE, so deleting the row
  would take the reader's library entry with it.

### Fixed
- **The Medium adapter could store the same post once per tag feed.** `generic-rss` and
  `discovery` both re-read recent titles after scoring, because sources run four-wide and each
  took its title snapshot before any of them inserted anything; `medium.ts` never did. Observed
  live: one Medium post stored three times — clean URL, `?source=rss------nvidia-5`, and
  `?source=rss------hugging_face-5` — the pair visible as identical cards in the feed.

### Known limitations
- Measured against the live table on 2026-09-10 (531 rows): **95 rows** collapse under the
  `dedupe_key` migration, **99 rows** are near-duplicate titles, **15 rows** are non-English, and
  none of them are reader-owned. Nothing has been deleted yet — migration
  `20260910010000_add_dedupe_key.sql` and `20260910020000_split_discovery_cron.sql` are still
  unapplied, and both cleanup tools default to a dry run.
- Two Medium posts about the same story by different authors ("Nvidia's $12.9 Billion Hugging
  Face Acquisition" and "Nvidia eyes $12.9 bn Hugging Face acquisition deal") score below the 0.8
  near-duplicate threshold and survive both gates. Lowering the threshold to catch them would
  start merging genuinely different articles; cross-author story clustering is a separate problem.

## 2026-09-10 — Following one topic now means reading about one topic

### Fixed
- **A reader following only OpenAI was served NVIDIA stories.** `content_item_topics` records
  every topic a story *mentions* — `classifyContent` keeps its top 3 keyword matches — so a piece
  titled "Why NVIDIA's True AI Moat Isn't Hardware" that says "OpenAI" once is stored under both,
  and the feed's `IN (selected topic ids)` query treated the two links as equal.
- The link table has no confidence or primary-topic column, so the ordering is recovered from the
  text at read time: `src/lib/feed-relevance.ts` re-weights mentions (a headline hit counts three
  times a summary hit) and keeps an item only when a selected topic is among its leading topics.
  Items with no keyword in title or summary fall back to their stored links, so nothing classified
  from body text or `source_topics` silently disappears. Saved items are exempt — the reader chose
  those.
- The topic pill and the "Matches X" explanation now name the topic the reader follows:
  `toFeedItem` takes the selected topics and orders an item's interests by them, instead of
  showing whichever link came back first.

### Known limitations
- This is a read-time reconstruction. The durable fix is a `confidence`/primary-topic column on
  `content_item_topics` written at classification time; until that exists, relevance is judged from
  title and summary only.

---


- **A submitted link never appeared until the page was reloaded.**
  `GET /api/submissions/[id]` returned a hardcoded `item: null`, but the dashboard poller only
  inserts the card when `status === "completed" && item`. That branch could never run, so the
  article was never added, the submission was never cleared from the pending list, and the
  client kept polling it every 2s indefinitely. The route now returns the finished item.
- The row-to-`FeedItem` mapping moved to `src/lib/feed-item.ts` and is shared by the feed and
  the submission poller. They had drifted once already — the poller's shape predated `trust`
  and `wordCount` — and one definition is what stops the card the poller inserts differing
  from the one a reload shows.

- **Non-English articles are now a hard reject (`non_english`).** Medium tag feeds mix languages
  freely under an English tag, and Marky's topics, aliases and UI are English — an unreadable
  story is not a lower-quality story, it is the wrong story.
  Two stages: script ratio (Devanagari, CJK, Cyrillic, Arabic, Hebrew, Thai, Greek and the
  Indic scripts), then an English function-word ratio for Latin-script text the script test
  cannot judge. The second stage is deliberately hard to trigger — it needs 40+ words and 20+
  distinct ones — because a false positive silently drops a real article while a false negative
  merely shows one odd item.
  **The title is measured separately from the body.** Verified against the 298 stored rows: a
  Marathi, a Russian and a Chinese article each scored only 0.14–0.19 across title+summary,
  because Latin boilerplate in the summary dilutes the ratio — while their titles scored 0.48,
  0.86 and 1.00. A combined-text check alone would have missed all three. Curly quotes in
  English titles are punctuation, not script, and are unaffected.

- **HTML entities reached the reader undecoded** — `plainText` in `src/lib/ingestion/rss.ts`
  handled six hardcoded named entities and no numeric ones, so summaries rendered as literal
  `&#x90F;&#x91C;...`. It decoded `&amp;` first, which turned a double-encoded `&amp;#x2019;`
  into `&#x2019;` — manufacturing the entity it then could not decode. Titles were unaffected
  because the XML parser decodes those; descriptions arrive in CDATA, where it does not.
  Measured across the 298 stored rows: **94 (32%) carried undecoded entities** — most commonly
  `&#x2026;` (…) ×46 and `&#x2019;` (’) ×31, so ordinary English content was affected too, and
  one Russian summary was 111 entities long.
  `decodeEntities` now handles named and numeric forms, runs up to three passes for
  double-encoding, and refuses malformed code points and lone surrogates rather than corrupting
  the string. Tags are still stripped before decoding, so a decoded `<` stays literal text.
- **This was also a hole in the language check.** Entity-encoded text is pure ASCII, so
  `nonLatinRatio` scored it zero — the Russian article was caught only because its title
  happened to be stored decoded. Had both been encoded it would have passed. Decoding closes
  that hole, and a test asserts the gate now rejects a candidate whose script was hidden as
  ASCII.

- **Removed 8 duplicate `content_items` from the development database** (342 -> 334). All were
  the same article reached through two Medium tag feeds, which stamp a different
  `?source=rss----<tag>` into the link and so hashed differently. Verified first that none was
  referenced by `saved_items` — the foreign key is `ON DELETE CASCADE`, so deleting a
  referenced row would have silently removed a user's saved article. The keeper in each group
  is the richest row (image, then body), tie-broken by oldest. URL-duplicate groups are now 0.
- **Closed a duplicate race between concurrently running sources.** Each run loaded its recent
  titles once at the start, so two feeds carrying the same syndicated story in one wave could
  not see each other — which is how Google Blog and Google DeepMind Blog stored the same four
  posts twice, and raising concurrency to 8 widened the window. After scoring, a run now
  re-reads recent titles once and drops any accepted candidate a sibling run stored in the
  meantime.

- **Hacker News discovery adapter** (`source_type = 'hacker_news'`), 11 sources, one per topic
  except Resend. It is the first source that reports what *other people* reacted to rather than
  what a publisher announced, and the first producer of `content_item_signals` — the table the
  feed and Trending have read as zero since it was created, leaving 35% of the Trending score
  dead weight. Points plus comments now populate it.
  - New `sources.discovery_query` and `sources.min_engagement` columns, with a CHECK that a
    `hacker_news` source cannot exist without a query (it would otherwise return the front page
    and attach whatever is popular to that source's topic).
  - When HN points at an article Marky already stored from its publisher's own feed, the
    adapter records the reaction and raises `source_count` instead of inserting a duplicate —
    the Discovery Map's "same URL on two platforms is one item with a higher source count".
  - The HN submitter is **not** recorded as the author. That field is a username, not the
    article's author, and presenting one as the other is the fabricated attribution the honesty
    rules forbid. The author comes from extracting the page, or stays null.
  - Tuned against the live index: `restrictSearchableAttributes=title` (a bare `nextjs` query
    returned 280 hits led by "Nancy Grace Roman Space Telescope") and `typoTolerance=false` (a
    "Vercel" search returned "Vermell — dependency-free C++ web framework"). The age window is
    30 days, not Medium's 14, because over 14 days DeepMind, Supabase, Next.js and Neon returned
    nothing at all — HN discusses them in bursts.

### Not built

- **Bluesky.** Post search requires authentication: `public.api.bsky.app` returns 403 to
  `app.bsky.feed.searchPosts` regardless of User-Agent, and `bsky.social` returns
  `AuthMissing`. Public author feeds *do* work unauthenticated, but measured on 2026-09-09 they
  carry very little — several official tech handles had zero posts, engagement was in single
  digits, and the one external link found pointed at a blog Marky already ingests by RSS. A
  useful Bluesky adapter needs an account app password; the curated-account version would add
  sources that produce almost nothing.

- **The brief now leads with key points instead of the whole article.** A 14-minute GitHub
  availability report was rendered in full inside the modal, which is not a brief.
  `src/lib/summarize.ts` picks the 4 most informative sentences and the full text moves behind a
  "Read full article" toggle.
  - **Extractive, not generative.** Every line returned is a sentence the publisher actually
    wrote. A generated summary would be new text presented as the article's meaning — the kind
    of fabrication the honesty guarantees exist to prevent, and wrong sometimes, silently. This
    can only ever be a worse *selection*, never a false statement. It also keeps the Discovery
    Map's rule that nothing learned or generative lands while the deterministic version works.
  - Scoring is arithmetic: term frequency (normalised, averaged over unique words so length is
    not rewarded), position, whether the sentence names the topic, and whether it carries a
    figure.
  - Two extraction artefacts had to be filtered, both found by running it over the real corpus:
    Medium inlines `Press enter or click to view image in full size` and a `18 min read2 hours
    ago` byline strip into the body, and both scored well enough to be chosen as key points.
    Readability also drops the space after punctuation, producing `...and how?In October 2025`,
    so the splitter now also breaks on punctuation followed directly by a capital.
  - Known limit: headings concatenated without punctuation (`Part 1: Two Mathematical ProofsThe
    Verification Problem`) cannot be split by any punctuation-based rule.

- **`content_items.dedupe_key`, a database-derived duplicate key**
  (`20260910010000_add_dedupe_key.sql`), with a unique index.
  `url_hash` is computed by the application at insert time, so it records whichever
  canonicalisation rules were live when a row arrived. That caused a failure worth recording:
  after stored URLs were rewritten to strip Medium's `?source=rss----<tag>` stamp, an
  application still running the old rules stopped matching them -- it looked up the stamped
  hash, found nothing, and inserted a second copy. "Building PullWard AI..." was stored twice
  on 2026-09-10 for exactly that reason: same Medium post id, same author, one URL stamped and
  one clean. **Normalising stored data while the writer still produced the old shape is what
  created it.**
  The key is derived by Postgres from `canonical_url`, so every writer -- old code, new code,
  the submission worker, a future adapter -- collapses onto the same value whether it knows the
  rule or not, and a duplicate insert fails with 23505, which the adapters already treat as an
  existing item. The normalisation was checked against stamped, clean, multi-parameter and
  non-feed `?source=` URLs before being committed to SQL.
- Merged 29 duplicate rows from the development database (445 -> 416). Visible duplicate URL
  and title groups are both 0; all 5 saved items intact.

- **Feed images are requested at the size they are painted** (`src/lib/images.ts`). Cards render
  into a 180x120 slot, but the stored URL is whatever the publisher put in their feed -- usually
  the full-resolution original. Measured across ten real feed images on 2026-09-10: **14.7 MB,
  with single images at 1.8, 2.2 and 3.6 MB**, every one of them painted into a thumbnail.
  Narrowing the request took the same ten to **2.5 MB, an 83% saving**. This matters more since
  For You started returning 100 items instead of 30.
  `thumbnailUrl` rewrites the width inside URLs the CDN already understands (Medium's `/max/N/`
  and `resize:fit|fill:N`). It introduces no new host, proxies nothing, and leaves Next.js image
  optimisation off -- publisher hosts are unbounded, and allow-listing them would break every new
  source. It only ever narrows: a URL already asking for less is returned untouched, and a host
  with no known resize grammar is left alone, because a wrong guess is a broken image and that is
  worse than a heavy one.

- **Submitted links now appear in Saved only, not in the dashboard.** A link the reader chose is
  theirs to keep, not a recommendation to hand back to them.
  The Saved library and the dashboard read the same `/api/feed` response, so the caller now says
  which it is (`?page=saved`) and the route excludes this reader's completed submissions from the
  other views. The exclusion runs *before* the saved-item exemption, which would otherwise pull
  every submitted link straight back in — which is exactly how they were reaching the dashboard:
  all 5 submitted items are `is_hidden = true`, rejected by the gate, and were visible only
  because they were saved.
  Scoped to the submitting profile, so the same article found by a source still reaches other
  readers normally.
  **This reverses two written rules**, and both were updated in `AGENTS.md` rather than left to
  contradict the code: submitted URLs becoming "dashboard items", and saved items always
  appearing first in For You.

### Performance

Measured against live `ingestion_runs`: `Hugging Face Blog` took **18.6s to see 20 items and
insert 0** — 20 sequential `url_hash` lookups, every one a duplicate. A 16-source tick summed to
~122s of source time; at concurrency 4 that is ~4 waves, right at the route's 60s `maxDuration`.

- **Duplicate detection is one query per source, not one per candidate.** `.in("url_hash", …)`
  over the whole batch, resolved through a Map. This was the dominant cost.
- **Qualification verdicts are written in one batch**, and now written *before* any insert, so a
  later insert failure cannot lose the record of what the gate decided. A 23505 anywhere in the
  batch would reject every row, so on conflict it falls back to row-by-row — the exception, not
  the norm.
- **Cron concurrency raised 4 → 8.** Safe only because a source run is now dominated by two
  network waits rather than a long tail of database round trips.

---


## 2026-09-10 — Discovery Map Step 3: the free discovery tier (DEV.to, Stack Exchange, GitHub releases, YouTube)

Hacker News proved the shape on 2026-09-09. This adds the rest of the free tier behind one
interface, so discover → extract → qualify → classify → rank now runs for every platform.

### Added
- **One interface, one pipeline.** `src/lib/ingestion/discovery.ts` owns everything after the
  fetch — extraction, qualification, storage, signals, topic links, run bookkeeping — because none
  of it differs by platform. An adapter supplies only `fetchHits`, its `platform`, whether the page
  needs fetching, and an optional quota bucket. Four new platforms cost four mapping modules
  instead of four copies of a 200-line pipeline, and a new source of an existing platform is a
  database row alone.
- **DEV.to** (`dev_to`) — tag search with a reaction floor applied after the fetch, since the API
  has no minimum-reactions parameter. A cross-posted article is stored under its `canonical_url`,
  not DEV's copy. 9 sources seeded.
- **Stack Exchange** (`stack_exchange`) — answered questions only, sorted by votes rather than
  date, body from the `withbody` filter so no page fetch is needed. The site slug is read from
  `site_url`, so no column was added for it. 8 sources seeded.
- **GitHub releases** (`github_releases`) — the only new **official**-tier source: a release is the
  project announcing its own work, and the notes are the article. Drafts and prereleases are
  dropped. This is the tier that finally covers **Resend** and **Neon**, whose bare-word names make
  them unusable as tags. 11 sources seeded.
- **YouTube** (`youtube`) — channel feeds parsed with `media:community` kept, which is the whole
  point: the generic RSS parser would read the entries and drop the view counts. **No sources are
  seeded** — see *Not addressed*.
- **A quota ledger** (`public.discovery_quota`, `consume_discovery_quota`, `src/lib/ingestion/quota.ts`).
  Stack Exchange publishes 300 requests per IP per day, GitHub 60 per hour, and those budgets are
  shared by every source of that type — so the count lives in the database and is spent through a
  row-locking function, because two sources of one platform run concurrently inside a single cron
  tick and could otherwise both spend the last slot. Budgets sit below the ceilings (200/day,
  40/hour): the IP may not be Marky's alone, and a breach costs a block that takes out every source
  of that type.
- 26 unit tests across the four mapping modules.

### Changed
- **Hacker News moved onto the shared runner**, behaviour unchanged. Its adapter is now a
  `fetchHits` function and a config object; the pipeline it used to carry is the shared one. Points
  are still what gets scored and points-plus-comments still what gets stored, which is why
  `DiscoveryHit` carries an optional `signalCount` distinct from `engagementCount`.
- **`vitest.config.ts` aliases `server-only`** — added for the dedupe work, and now load-bearing
  for the discovery modules too.
- `docs/SOURCE_INGESTION.md` gains a discovery-sources section, reversing the ban on search and
  community sources it still recorded. The reason for that ban was the absence of a quality gate;
  that reason no longer holds. Its claim that the legacy `medium_rss` adapter "never calls
  `qualifyCandidate`" is also corrected — that stopped being true on 2026-09-09.

### Security
- Every discovery fetch goes through `assertPublicHttpUrl` with `redirect: "manual"`, a 12s
  timeout and a 2 MB cap, even though the endpoints are hard-coded constants: the query string is
  built from database configuration, and no fetch of a URL assembled from stored input bypasses
  the SSRF guard.
- `consume_discovery_quota` is not `SECURITY DEFINER`, and `EXECUTE` is revoked from `anon` and
  `authenticated` and granted only to `service_role`. `discovery_quota` has RLS on with no reader
  policy — the ingestion budget is not reader-facing data.
- A ledger that cannot be read raises rather than returning "allowed", so a failed migration
  degrades to no discovery rather than to unmetered requests.

### Not addressed
- **No YouTube source is seeded.** The channel feed accepts only a `UC…` id — not a handle, not a
  name — and a wrong id returns an empty feed rather than an error, so a guessed id would produce a
  source that silently found nothing for ever. The adapter and constraints are in place and the
  migration carries a worked `INSERT`; adding a channel needs its real id and no deploy.
- **Google / Google DeepMind has no discovery source.** No DEV or Stack Exchange tag matches the
  topic, and no single repository represents it. It keeps its official blog feeds.
- The migration has not been applied to the live project, so none of these sources have run yet.
- Seeded tags, repository slugs and floors are reasoned defaults, not measurements against the
  live APIs. Expect to tune `min_engagement` once `discovery_candidates` shows what each source
  actually returns.


## 2026-09-09 — Duplicate removal: a cleanup pass for stored rows, and the gate on the last adapter that skipped it

### Added
- **`src/lib/dedupe.ts` — near-duplicate detection over rows that are already stored.** Pure and
  unit-tested (14 cases). Reuses the same `shingles`/`jaccard` pair and the same
  `NEAR_DUPLICATE_THRESHOLD` as the ingestion gate, deliberately: two stories ingestion would have
  called duplicates must not be called distinct by cleanup, or prevention and repair would disagree.
  Candidates are blocked by shared shingle before comparison (titles sharing no bigram are never
  compared), and matches are merged transitively through union-find, so a chain A~B~C yields one
  group with one survivor rather than two overlapping pairs.
- **`POST /api/cron/dedupe` — the operator tool that runs it.** `Bearer CRON_SECRET`, 503 in demo
  mode, **dry run by default**; pass `dryRun=false` to write, plus `windowDays` (default 90) and
  `limit` (default 2000). Not scheduled — deletion is irreversible, so a dry run is meant to be
  read first. Same shape as `/api/cron/backfill`.
- **`src/lib/ingestion/dedupe-store.ts` — the merge.** Deleting a `content_items` row cascades to
  `content_item_topics`, `saved_items` and `content_item_signals`, so **every reference moves onto
  the survivor before the delete**: topic links are upserted, `user_submissions.content_item_id` is
  re-pointed (its FK is `ON DELETE SET NULL`, so without this a submission would silently lose the
  article it produced), and saved rows collapse to one per user — read if either copy was read,
  dated from the earlier save. A user who saved the losing copy keeps the story, pointing at the
  better one.

### Changed
- **`ingestMediumSource` now runs the qualification gate.** It was the one ingestion path that
  went straight from `isRecent()` to `insert`, storing anything recent, near-duplicate or not.
  This is why `20260909020000_add_medium_tag_sources` seeded Medium tag feeds as `source_type`
  `'rss'` rather than routing them here. That workaround stays correct; the hole behind it is now
  closed, so seeding a `medium_rss` source is no longer a way to bypass the gate. `SourceResult.rejected`
  is now real for this adapter instead of a hardcoded `0`, and verdicts reach `discovery_candidates`.
- **The survivor of a duplicate group is the richest row**, then the earliest publication (the
  original rather than the syndication), then the earliest stored, then `id`. The final tie-break
  exists only so a dry run predicts exactly what the write run will delete.
- **Recurring editions are protected from the merge.** Titles matching across more than
  `MAX_DUPLICATE_DAY_SPREAD` (7) days are treated as separate stories: a weekly digest or a
  "Release notes" post reuses its headline verbatim every issue. A genuine syndicated duplicate
  appears within days, so the window costs nothing. An unknown date never separates two items —
  a missing date is not evidence of distinctness.
- **`vitest.config.ts` aliases `server-only` to a stub** (`vitest.server-only-stub.ts`). The guard
  exists to keep server modules out of a client bundle; vitest runs in node, which is not one, so
  it only made server modules untestable. Next.js still enforces the real package at build time.

### Fixed
- **`chooseKeeper` was order-dependent for undated items.** Both timestamps fall back to
  `Number.POSITIVE_INFINITY`, and `Infinity - Infinity` is `NaN`; a comparator returning `NaN`
  makes `Array.prototype.sort` order-dependent, so a dry run could name a different survivor than
  the run that actually deleted. Comparison is now explicit. Caught by a unit test, not in review.

### Not addressed
- Exact-URL duplicates were never possible: `content_items.url_hash` is `NOT NULL UNIQUE`, and
  `GET /api/feed` already dedupes eligible IDs with a `Set` before ranking. Everything this change
  finds is one story stored under two different URLs.
- The cleanup is not scheduled and has not been run against the live project.


## 2026-09-09 — Medium tag feeds as a community-tier source

Adds the first non-official content source. Ten Medium tag feeds now supplement the
13 official publisher blogs, gated by the qualification score and ranked below
official content.

### Added
- Ten `community`-tier Medium tag sources (`20260909020000_add_medium_tag_sources.sql`),
  seeded as `source_type = 'rss'` so they run through the generic adapter and its
  qualification gate, with `source_topics` links and a migration-level assertion that
  fails the whole file if any link is missing.
- `FeedItem.trust`, carried from `sources.trust_tier` through `GET /api/feed`.
- A trust multiplier in `src/lib/ranking.ts` (`official 1 / community 0.85 /
  probationary 0.7 / unknown 0.6`) applied to the finished For You and Trending
  scores. `latest` is untouched: it is a promise about time, and trust-weighting it
  would make the label lie.
- Tests for tier scoring, trust-aware ordering, `latest` staying a pure date sort,
  Medium not being treated as an aggregator, and the Medium URL dedup case.
- **Source-page enrichment at ingest** (`src/lib/ingestion/enrich.ts`). When a feed entry
  has no image or a body under the 400-word substance bar, the generic adapter fetches the
  source page through the same guarded `fetchWebMetadata` the backfill and submission
  worker use, and fills image, body, author and summary from `og:image`/JSON-LD and
  Readability *before* qualification — so the gate scores the article, not the teaser.
  Capped at 12 fetches per run, four wide; a failed fetch keeps the feed's version.
- `content_items.word_count`, a generated column
  (`20260909030000_add_content_item_word_count.sql`), carried to `FeedItem.wordCount`.
- `GET /api/items/[id]` returns the stored article body for the brief; the client loads
  it on open (signed-in, non-demo only) and renders it as paragraphs above "Read original",
  with a note naming the source the text was extracted from.

- "N min read" was computed from the length of the title plus the summary — an invented
  number. It is now the stored body's word count at ~200 wpm, and **omitted** when no body
  was extracted rather than estimated.
- **Outbound page fetches sent no `User-Agent`, and Medium answers that with a bare 403.**
  Extraction was therefore failing silently for every Medium article: the page fetch threw,
  the feed's teaser stood, and nothing recorded why. Verified against live articles — no UA
  and a plain `Marky/1.0` both return 403; the crawler convention
  `Mozilla/5.0 (compatible; MarkyBot/1.0; +url)` returns 200 with `og:image` present.
  `MARKY_USER_AGENT` (`src/lib/ingestion/network.ts`) is now sent on both page and feed
  fetches. It identifies Marky with a contact URL rather than impersonating a browser.

### Changed
- **Policy reversal.** `TOPIC_SOURCE_STRATEGY.md` prohibited tag aggregation outright;
  it now permits it as a `community` tier that must declare its topics. The ban existed
  because there was no quality gate. There is one now, so the rule was narrowed rather
  than kept. The eight broad tag *topics* removed on 2026-09-04 stay removed — they had
  no official publisher behind them, which is a different problem.
- `canonicalizeUrl` strips Medium's `?source=rss----<feed id>` stamp. Matched on the
  `rss` value rather than the bare `source` key, so URLs already stored keep their hash.
- The `recentTitles` query in `qualification/store.ts` is now ordered newest-first. Its
  500-row cap was previously an arbitrary slice, which near-duplicate detection depends
  on and which adding community sources would have degraded.

### Fixed
- `/debug/ingestion` matched a topic's source by substring over a name-ordered list, so
  "Medium — OpenAI" would have displaced "OpenAI News" for nearly every topic. The
  per-topic audit now considers official sources only.
- A pre-existing `prefer-const` lint error in the feed route's fallback-query block.

### Security
- Routing Medium through the generic adapter means these fetches get the DNS-level
  `assertPublicHttpUrl` check and a capped manual redirect loop. The legacy `medium.ts`
  used `redirect: "follow"` with a host allowlist and no DNS validation.

### Known limitations
- **The tag slugs are not network-verified.** A wrong slug returns an empty channel
  rather than an error, so the run reports `succeeded` with nothing fetched. Check
  `/debug/ingestion` for any Medium source showing no data before judging feed quality.
- **Resend and Neon have no Medium source.** Their aliases are the bare words "resend"
  and "neon", so the matching tags would pass OTP tutorials and neon-sign posts straight
  through the gate on a title match. Both need a non-tag discovery source.
- `latest` will skew Medium-heavy over time, since ten tag feeds out-publish 13 corporate
  blogs. That is inherent to one blended feed with no user toggle; the levers are the
  qualification threshold and `max_article_age_days`, not the sort.
- Clap counts are still not captured, so Medium items report no engagement and Trending
  remains recency-driven.

---

## 2026-09-09 — Discovery Map Steps 1 & 2: extraction hardening and the qualification gate

Implements the first two steps of the Marky Discovery Map: fix what the existing
pipeline silently dropped, then gate quality before storage.

### Added
- `source_topics`: a source declares its topics in data instead of the classifier inferring them from the source name. Seeded for all 13 baseline feeds.
- `content_item_signals`: real engagement and independent-source counts, read by `GET /api/feed`.
- `discovery_candidates`: the reject log — every candidate's score, decision and reason, surfaced in a new panel on `/debug/ingestion`.
- `topic_aliases`: keyword lists moved from `src/lib/ingestion/classify.ts` into rows, seeded to match the previous hardcoded behaviour.
- `src/lib/qualification/`: a pure, unit-tested 0-1 scorer (relevance .35, trust .20, substance .20, engagement .15, freshness .10) plus hard rejects for duplicates, near-duplicate titles, aggregator domains, spam markers and paywalls without a summary. Threshold 0.6.
- `POST /api/cron/backfill`: resumable, `CRON_SECRET`-protected re-extraction of rows stored before images, body text and the gate existed. Dry run by default.
- A `pg_cron` job for `/api/cron/process-links`, which nothing scheduled before.
- JSON-LD (`Article`/`NewsArticle`/`BlogPosting`) reading for image, author and publication date.

### Changed
- `fetch_interval_minutes` lowered from 30 to 15 on the seeded sources, so the `*/15` cron tick is no longer wasted (effective refresh was ~45 minutes).
- `sources.max_article_age_days` is now a real column, replacing a hardcoded source-name list in `generic-rss.ts`.
- `classifyContent` takes body text instead of the source name, and topics are the union of source-declared and keyword-matched topics.
- Submitted links now persist `image_url` and `body_content`.

### Fixed
- **Every stored item had `image_url = null`.** `trustedImageUrl` allow-listed only Medium hosts, discarding every other publisher's feed image. Split into `mediumImageUrl` (unchanged, still used by the Medium adapter) and `safeImageUrl`, which accepts any public HTTPS image and resolves relative sources against the item link.
- **Every stored item had no body text.** `content_items.body_content` existed but was never written; `parseWebMetadata` discarded Readability's output. Both feed `content:encoded` and extracted page bodies are now stored.
- **Off-topic items were filed under a topic** because the source name was part of the keyword haystack — "Google Blog" matched `google` on everything it published. Covered by a regression test using the real offending title.
- `engagementCount` and `sourceCount` were hardcoded `0` and `1` in the feed route, leaving two of `trendingScore`'s four terms dead.
- A submitted link with no keyword match was labelled `"Developer Tools"`, a topic that does not exist in the closed topic list.

### Security
- `safeImageUrl` rejects non-HTTPS URLs, embedded credentials, and literal private/loopback hosts. Server-side fetches still go through `assertPublicHttpUrl`; the backfill reuses `fetchWebMetadata` rather than adding a second fetch path.
- `discovery_candidates` is RLS-denied to `authenticated`, matching `ingestion_runs`.

### Known limitations
- Engagement is still never written: `content_item_signals` has no producer until discovery adapters land in Step 3, so the feed reads its `0`/`1` defaults.
- When a source reports no engagement at all (every RSS feed), the engagement weight is redistributed across the other four signals rather than scored as zero. Scoring it zero would cap every official-blog item at 0.85 and drop good posts below the threshold purely for lacking vote counts. A platform reporting an actual zero still scores zero.
- Steps 3 (free discovery adapters) and 4 (extraction chain, real ranking signals) are not started. `docs/SOURCE_INGESTION.md` still forbids search and community sources and needs rewriting as part of Step 3.
- Migrations in this change have not yet been applied to the live Supabase project.

## 2026-09-05 — Desktop Responsiveness, Sidebar Navigation Cleanup & Author Metadata Omission

### Added
- **`isValidAuthor` Type Helper**: Created `isValidAuthor` utility in `src/lib/types.ts` to identify missing or generic fallback author strings (`Unknown author`, `Unknown`, `N/A`, `Anonymous`, `null`, `undefined`).

### Changed
- **Fluid Desktop & Ultrawide Responsive Scaler**: Upgraded layout break scaling in `src/app/reference.css` and `src/app/reference-sections.css` for 1440px, 1600px, 1920px, and 2560px+ monitors. Removed artificial narrow max-width bottlenecks (`1080px`, `1600px`) causing large empty right-side white space on wide displays.
- **Sidebar Navigation Cleanup**: Completely removed redundant "Discover" navigation link from sidebar while preserving `/latest` feed tab functionality.
- **Supabase Vault Cron Migration**: Updated `supabase/migrations/20260905000000_setup_ingestion_cron.sql` to pull `marky_cron_url` and `marky_cron_secret` safely from `vault.decrypted_secrets`.

### Fixed
- **Author Metadata Omission**: Eliminated display of "Unknown author" across article cards, feed lists, and brief modal dialogs. When author metadata is missing or invalid, the author label is cleanly omitted without preceding separators.

### Verification
- `npm run typecheck`: Passed (0 errors).
- `npm run lint`: Passed (0 errors, 0 warnings).
- `npm test`: Passed (18/18 tests passed across 7 test suites).
- `npm run build`: Passed (0 errors, Next.js app bundle generated).

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
