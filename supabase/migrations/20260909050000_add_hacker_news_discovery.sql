--------------------------------------------------------------------------------
-- HACKER NEWS AS A DISCOVERY SOURCE
--------------------------------------------------------------------------------
-- Every source so far has been a publisher announcing its own work. Hacker News
-- is the first that reports what other people are reacting to, which is the one
-- signal an RSS feed can never carry.
--
-- It is also the first producer of content_item_signals. The feed and the
-- Trending formula have read that table since it was created and always found
-- zero, so 35% of the Trending score has been dead weight and Trending has in
-- practice been a recency sort. Points plus comments make it real.
--------------------------------------------------------------------------------

-- 1. A discovery source searches; it does not have a feed URL.
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS discovery_query TEXT
    CHECK (discovery_query IS NULL OR char_length(discovery_query) BETWEEN 2 AND 200);

-- Floor on reported reactions, so a source can be tuned without a deploy. NULL
-- lets the adapter apply its own default.
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS min_engagement INTEGER
    CHECK (min_engagement IS NULL OR min_engagement >= 0);

-- 2. Allow the new source type.
ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_source_type_check
  CHECK (source_type IN ('rss', 'atom', 'api', 'web', 'platform', 'medium_rss', 'hacker_news'));

-- A search source with no query would return the front page and attach whatever
-- is popular today to this source's topic.
ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_discovery_query_required;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_discovery_query_required
  CHECK (source_type <> 'hacker_news' OR discovery_query IS NOT NULL);

--------------------------------------------------------------------------------
-- 3. SOURCES
--------------------------------------------------------------------------------
-- trust_tier 'community': HN is a crowd, not a publisher. The link it points at
-- may be anyone's, so these clear the same 0.6 bar as Medium rather than the
-- official tier's easier path.
--
-- The adapter searches titles only. Verified against the live index on
-- 2026-09-09: a bare 'nextjs' query returns 280 hits led by "Nancy Grace Roman
-- Space Telescope" because Algolia matches comment text with typo tolerance,
-- while a title-restricted search returns 109 hits that are actually about
-- Next.js.
--
-- min_engagement is the floor the Discovery Map names, tuned per topic against
-- the live index on 2026-09-09. The window is 30 days rather than the 14 used
-- for Medium: measured over 14 days, DeepMind, Supabase, Next.js and Neon
-- returned nothing at all, because HN discusses them in bursts rather than
-- weekly. Some of these sources will still return nothing in a quiet month,
-- which is the correct behaviour for a source that reports real reactions
-- rather than manufacturing volume.
--
-- Staggered last_fetched_at spreads the first due-wave, as with Medium.
INSERT INTO public.sources
  (name, source_type, site_url, discovery_query, min_engagement, trust_tier, fetch_interval_minutes, max_article_age_days, is_active, last_fetched_at)
VALUES
  ('Hacker News — OpenAI',       'hacker_news', 'https://news.ycombinator.com', 'OpenAI',      15, 'community', 60, 30, true, now() - interval '57 minutes'),
  ('Hacker News — Hugging Face', 'hacker_news', 'https://news.ycombinator.com', 'Hugging Face', 10, 'community', 60, 30, true, now() - interval '51 minutes'),
  ('Hacker News — NVIDIA',       'hacker_news', 'https://news.ycombinator.com', 'Nvidia',      15, 'community', 60, 30, true, now() - interval '45 minutes'),
  ('Hacker News — DeepMind',     'hacker_news', 'https://news.ycombinator.com', 'DeepMind',    10, 'community', 60, 30, true, now() - interval '39 minutes'),
  ('Hacker News — Vercel',       'hacker_news', 'https://news.ycombinator.com', 'Vercel',      10, 'community', 60, 30, true, now() - interval '33 minutes'),
  ('Hacker News — Supabase',     'hacker_news', 'https://news.ycombinator.com', 'Supabase',    10, 'community', 60, 30, true, now() - interval '27 minutes'),
  ('Hacker News — Next.js',      'hacker_news', 'https://news.ycombinator.com', 'Next.js',     10, 'community', 60, 30, true, now() - interval '21 minutes'),
  ('Hacker News — React',        'hacker_news', 'https://news.ycombinator.com', 'React',       15, 'community', 60, 30, true, now() - interval '15 minutes'),
  ('Hacker News — TypeScript',   'hacker_news', 'https://news.ycombinator.com', 'TypeScript',  10, 'community', 60, 30, true, now() - interval '9 minutes'),
  ('Hacker News — GitHub',       'hacker_news', 'https://news.ycombinator.com', 'GitHub',      15, 'community', 60, 30, true, now() - interval '3 minutes'),
  ('Hacker News — Neon',         'hacker_news', 'https://news.ycombinator.com', 'Neon Postgres', 5, 'community', 60, 30, true, now())
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 4. SOURCE -> TOPIC LINKS
--------------------------------------------------------------------------------
-- Mandatory, and enforced twice: the adapter refuses to run without them, and
-- the assertion below fails this migration. Without the link a discovery source
-- is scored against every alias in the table and will attach anything it finds
-- to any topic.
INSERT INTO public.source_topics (source_id, topic_id)
SELECT s.id, t.id
FROM (
  VALUES
    ('Hacker News — OpenAI',       'OpenAI'),
    ('Hacker News — Hugging Face', 'Hugging Face'),
    ('Hacker News — NVIDIA',       'NVIDIA'),
    ('Hacker News — DeepMind',     'Google / Google DeepMind'),
    ('Hacker News — Vercel',       'Vercel'),
    ('Hacker News — Supabase',     'Supabase'),
    ('Hacker News — Next.js',      'Next.js'),
    ('Hacker News — React',        'React'),
    ('Hacker News — TypeScript',   'TypeScript'),
    ('Hacker News — GitHub',       'GitHub'),
    ('Hacker News — Neon',         'Neon')
) AS mapping(source_name, topic_name)
JOIN public.sources s ON s.name = mapping.source_name
JOIN public.topics  t ON t.name = mapping.topic_name
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  orphans TEXT;
BEGIN
  SELECT string_agg(s.name, ', ') INTO orphans
  FROM public.sources s
  WHERE s.source_type = 'hacker_news'
    AND NOT EXISTS (SELECT 1 FROM public.source_topics st WHERE st.source_id = s.id);

  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Hacker News sources without a source_topics row: %', orphans;
  END IF;
END $$;

-- Trending orders by engagement, so the column it reads needs an index that
-- matches how the feed reads it.
CREATE INDEX IF NOT EXISTS content_item_signals_engagement_idx
  ON public.content_item_signals (engagement_count DESC);
