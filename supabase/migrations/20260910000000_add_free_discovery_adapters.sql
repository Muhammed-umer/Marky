--------------------------------------------------------------------------------
-- FREE DISCOVERY ADAPTERS: DEV.TO, STACK EXCHANGE, GITHUB RELEASES, YOUTUBE
--------------------------------------------------------------------------------
-- Step 3 of the Discovery Map. Hacker News proved the shape on 2026-09-09; this
-- adds the rest of the free tier behind the same interface, so the pipeline is
-- now discover -> extract -> qualify -> classify -> rank for every platform.
--
-- What each one contributes that the RSS layer cannot:
--   DEV.to          - community writing about a topic, with a reaction count.
--   Stack Exchange  - the problems people actually hit, with a vote score.
--   GitHub releases - what shipped, from the project itself. The only tier-1
--                     trusted source here: a release is the vendor announcing.
--   YouTube         - conference talks and vendor channels, with view counts.
--
-- All four are keyless. Two publish a hard per-IP limit and are metered by the
-- quota ledger below; DEV.to and YouTube publish none.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- 1. SOURCE TYPES
--------------------------------------------------------------------------------
ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_source_type_check
  CHECK (source_type IN (
    'rss', 'atom', 'api', 'web', 'platform', 'medium_rss',
    'hacker_news', 'dev_to', 'stack_exchange', 'github_releases', 'youtube'
  ));

-- discovery_query means something different per platform, and every platform
-- that searches needs one: a search term (Hacker News), a tag (DEV.to, Stack
-- Exchange) or an owner/repo slug (GitHub). YouTube is the exception -- it
-- watches a channel, and the channel id lives in feed_url like any other feed.
ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_discovery_query_required;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_discovery_query_required
  CHECK (
    source_type NOT IN ('hacker_news', 'dev_to', 'stack_exchange', 'github_releases')
    OR discovery_query IS NOT NULL
  );

ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_youtube_feed_required;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_youtube_feed_required
  CHECK (source_type <> 'youtube' OR feed_url IS NOT NULL);

--------------------------------------------------------------------------------
-- 2. THE QUOTA LEDGER
--------------------------------------------------------------------------------
-- Stack Exchange allows 300 requests per IP per day unauthenticated; GitHub
-- allows 60 per hour. Those budgets are shared by every source of that type, so
-- no single source can decide on its own whether a request is affordable. The
-- count has to live where all of them can see it.
--
-- Going over is not a soft failure: Stack Exchange answers a breach with a
-- temporary IP block that takes out every source of that type at once.
CREATE TABLE IF NOT EXISTS public.discovery_quota (
  platform TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0)
);

ALTER TABLE public.discovery_quota ENABLE ROW LEVEL SECURITY;
-- No policy for `authenticated`: a reader has no business seeing or spending
-- the ingestion budget, and service_role bypasses RLS for the workers.
GRANT ALL ON public.discovery_quota TO service_role;

/**
 * Reserves quota, or refuses.
 *
 * FOR UPDATE is the point of the function: two sources of the same platform run
 * concurrently inside one cron tick, and without the row lock both could read
 * the same `used` and both spend the last slot.
 *
 * The window resets lazily on read rather than on a schedule, so an idle
 * platform costs no background work.
 */
CREATE OR REPLACE FUNCTION public.consume_discovery_quota(
  p_platform TEXT,
  p_cost INTEGER,
  p_limit INTEGER,
  p_window_minutes INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_used INTEGER;
  v_window_started TIMESTAMPTZ;
BEGIN
  IF p_cost <= 0 OR p_limit <= 0 OR p_window_minutes <= 0 THEN
    RAISE EXCEPTION 'consume_discovery_quota: cost, limit and window must be positive';
  END IF;

  INSERT INTO public.discovery_quota (platform)
  VALUES (p_platform)
  ON CONFLICT (platform) DO NOTHING;

  SELECT used, window_started_at
    INTO v_used, v_window_started
  FROM public.discovery_quota
  WHERE platform = p_platform
  FOR UPDATE;

  -- The INSERT above guarantees the row, so this cannot normally happen. It is
  -- checked because the alternative is worse than an error: NULL arithmetic
  -- below would make the limit test NULL, fall through as "not over budget",
  -- update nothing and return true -- spending forever without recording.
  IF NOT FOUND OR v_used IS NULL OR v_window_started IS NULL THEN
    RAISE EXCEPTION 'consume_discovery_quota: no ledger row for %', p_platform;
  END IF;

  IF v_window_started < now() - make_interval(mins => p_window_minutes) THEN
    UPDATE public.discovery_quota
       SET window_started_at = now(), used = 0
     WHERE platform = p_platform;
    v_used := 0;
  END IF;

  IF v_used + p_cost > p_limit THEN
    RETURN false;
  END IF;

  UPDATE public.discovery_quota
     SET used = used + p_cost
   WHERE platform = p_platform;

  RETURN true;
END;
$$;

-- The ledger is an ingestion control, not reader-facing data.
REVOKE ALL ON FUNCTION public.consume_discovery_quota(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_discovery_quota(TEXT, INTEGER, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_discovery_quota(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

--------------------------------------------------------------------------------
-- 3. DEV.TO
--------------------------------------------------------------------------------
-- trust_tier 'community': anyone can publish under a DEV tag, so these clear
-- the same 0.6 bar as Medium and Hacker News.
--
-- min_engagement is a reaction floor applied after the fetch, because the API
-- has no minimum-reactions parameter. 25 is deliberately high: the tag firehose
-- is mostly tutorials and "top 10 VS Code extensions" posts.
--
-- THREE TOPICS ARE DELIBERATELY NOT SEEDED, for the reason the Medium migration
-- gave on 2026-09-09 and which has not changed:
--   Resend -- the tag is the English word "resend", dominated by "how to resend
--     an OTP" posts.
--   Neon   -- the tag is neon UI palettes and neon art.
--   Google / DeepMind -- there is no DEV tag for the topic; "google" is every
--     Google product at once, so relevance would score on the wrong thing.
-- Resend and Neon are covered by GitHub releases below, where an owner/repo slug
-- is unambiguous in a way a bare word tag never is. Google / DeepMind is not
-- covered anywhere in this migration -- see section 5 for why -- and keeps its
-- official blog feeds.
INSERT INTO public.sources
  (name, source_type, site_url, discovery_query, min_engagement, trust_tier, fetch_interval_minutes, max_article_age_days, is_active, last_fetched_at)
VALUES
  ('DEV.to — React',        'dev_to', 'https://dev.to', 'react',        40, 'community', 180, 30, true, now() - interval '170 minutes'),
  ('DEV.to — Next.js',      'dev_to', 'https://dev.to', 'nextjs',       30, 'community', 180, 30, true, now() - interval '160 minutes'),
  ('DEV.to — TypeScript',   'dev_to', 'https://dev.to', 'typescript',   30, 'community', 180, 30, true, now() - interval '150 minutes'),
  ('DEV.to — Supabase',     'dev_to', 'https://dev.to', 'supabase',     15, 'community', 180, 30, true, now() - interval '140 minutes'),
  ('DEV.to — OpenAI',       'dev_to', 'https://dev.to', 'openai',       25, 'community', 180, 30, true, now() - interval '130 minutes'),
  ('DEV.to — GitHub',       'dev_to', 'https://dev.to', 'github',       30, 'community', 180, 30, true, now() - interval '120 minutes'),
  ('DEV.to — Vercel',       'dev_to', 'https://dev.to', 'vercel',       15, 'community', 180, 30, true, now() - interval '110 minutes'),
  ('DEV.to — Hugging Face', 'dev_to', 'https://dev.to', 'huggingface',  10, 'community', 180, 30, true, now() - interval '100 minutes'),
  ('DEV.to — NVIDIA',       'dev_to', 'https://dev.to', 'nvidia',       10, 'community', 180, 30, true, now() - interval '90 minutes')
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 4. STACK EXCHANGE
--------------------------------------------------------------------------------
-- The site slug is read from site_url, so no column was added for it.
--
-- A question is not an article, and the adapter treats it differently: only
-- answered questions, sorted by votes rather than by date, with the body taken
-- from the API instead of by fetching the page.
--
-- Six-hour intervals: 8 sources x 4 runs a day is 32 requests against a 200/day
-- budget, which leaves room for the ledger's other spender and for a retry
-- storm without approaching the published 300 ceiling.
INSERT INTO public.sources
  (name, source_type, site_url, discovery_query, min_engagement, trust_tier, fetch_interval_minutes, max_article_age_days, is_active, last_fetched_at)
VALUES
  ('Stack Overflow — React',        'stack_exchange', 'https://stackoverflow.com', 'reactjs',                    15, 'community', 360, 30, true, now() - interval '350 minutes'),
  ('Stack Overflow — Next.js',      'stack_exchange', 'https://stackoverflow.com', 'next.js',                    10, 'community', 360, 30, true, now() - interval '340 minutes'),
  ('Stack Overflow — TypeScript',   'stack_exchange', 'https://stackoverflow.com', 'typescript',                 15, 'community', 360, 30, true, now() - interval '330 minutes'),
  ('Stack Overflow — Supabase',     'stack_exchange', 'https://stackoverflow.com', 'supabase',                    5, 'community', 360, 30, true, now() - interval '320 minutes'),
  ('Stack Overflow — OpenAI',       'stack_exchange', 'https://stackoverflow.com', 'openai-api',                  5, 'community', 360, 30, true, now() - interval '310 minutes'),
  ('Stack Overflow — GitHub',       'stack_exchange', 'https://stackoverflow.com', 'github',                     10, 'community', 360, 30, true, now() - interval '300 minutes'),
  ('Stack Overflow — Vercel',       'stack_exchange', 'https://stackoverflow.com', 'vercel',                      5, 'community', 360, 30, true, now() - interval '290 minutes'),
  ('Stack Overflow — Hugging Face', 'stack_exchange', 'https://stackoverflow.com', 'huggingface-transformers',    5, 'community', 360, 30, true, now() - interval '280 minutes')
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 5. GITHUB RELEASES
--------------------------------------------------------------------------------
-- trust_tier 'official', and it is the only new tier-1 source here: a release
-- is the project announcing its own work, which is exactly what the official
-- blogs are. The release notes are the article, so nothing is extracted from a
-- page.
--
-- This is the tier that finally covers Resend and Neon. Both were left out of
-- Medium, Hacker News and DEV.to because their names are bare English words
-- that poison a tag search; an owner/repo slug has no such ambiguity.
--
-- Hourly: 11 sources against a 40/hour budget.
--
-- GOOGLE / DEEPMIND IS DELIBERATELY ABSENT. There is no single repository that
-- represents the topic -- DeepMind's work ships as papers, and the `google` org
-- is thousands of unrelated projects. Seeding a guess would produce a source
-- that 404s quietly. The topic keeps its official blog feeds.
INSERT INTO public.sources
  (name, source_type, site_url, discovery_query, trust_tier, fetch_interval_minutes, max_article_age_days, is_active, last_fetched_at)
VALUES
  ('GitHub Releases — Next.js',      'github_releases', 'https://github.com/vercel/next.js',            'vercel/next.js',        'official', 60, 30, true, now() - interval '55 minutes'),
  ('GitHub Releases — React',        'github_releases', 'https://github.com/facebook/react',            'facebook/react',        'official', 60, 30, true, now() - interval '50 minutes'),
  ('GitHub Releases — TypeScript',   'github_releases', 'https://github.com/microsoft/TypeScript',      'microsoft/TypeScript',  'official', 60, 30, true, now() - interval '45 minutes'),
  ('GitHub Releases — Supabase',     'github_releases', 'https://github.com/supabase/supabase',         'supabase/supabase',     'official', 60, 30, true, now() - interval '40 minutes'),
  ('GitHub Releases — OpenAI',       'github_releases', 'https://github.com/openai/openai-python',      'openai/openai-python',  'official', 60, 30, true, now() - interval '35 minutes'),
  ('GitHub Releases — Hugging Face', 'github_releases', 'https://github.com/huggingface/transformers',  'huggingface/transformers', 'official', 60, 30, true, now() - interval '30 minutes'),
  ('GitHub Releases — Resend',       'github_releases', 'https://github.com/resend/resend-node',        'resend/resend-node',    'official', 60, 30, true, now() - interval '25 minutes'),
  ('GitHub Releases — Neon',         'github_releases', 'https://github.com/neondatabase/neon',         'neondatabase/neon',     'official', 60, 30, true, now() - interval '20 minutes'),
  ('GitHub Releases — Vercel',       'github_releases', 'https://github.com/vercel/vercel',             'vercel/vercel',         'official', 60, 30, true, now() - interval '15 minutes'),
  ('GitHub Releases — NVIDIA',       'github_releases', 'https://github.com/NVIDIA/TensorRT',           'NVIDIA/TensorRT',       'official', 60, 30, true, now() - interval '10 minutes'),
  ('GitHub Releases — GitHub',       'github_releases', 'https://github.com/cli/cli',                   'cli/cli',               'official', 60, 30, true, now() - interval '5 minutes')
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 6. YOUTUBE
--------------------------------------------------------------------------------
-- The adapter, the source type and the constraints are in place; NO SOURCES ARE
-- SEEDED HERE.
--
-- The channel feed accepts a channel id (the `UC…` form) and nothing else -- not
-- a handle, not a channel name -- and a wrong id returns an empty feed rather
-- than an error, so a guessed id produces a source that silently finds nothing
-- for ever. Seeding ids that have not been verified against the live endpoint
-- would be exactly the fabricated configuration the honesty rules forbid
-- everywhere else in this codebase.
--
-- Adding one is a single row and needs no deploy. Open the channel, take the
-- `UC…` id from its page source, then:
--
--   INSERT INTO public.sources
--     (name, source_type, site_url, feed_url, min_engagement, trust_tier,
--      fetch_interval_minutes, max_article_age_days, is_active)
--   VALUES
--     ('YouTube — Vercel', 'youtube', 'https://www.youtube.com/@VercelHQ',
--      'https://www.youtube.com/feeds/videos.xml?channel_id=UC…',
--      2000, 'community', 360, 30, true);
--
--   INSERT INTO public.source_topics (source_id, topic_id)
--   SELECT s.id, t.id FROM public.sources s, public.topics t
--   WHERE s.name = 'YouTube — Vercel' AND t.name = 'Vercel';
--
-- min_engagement is a view floor. Without one a channel's every short lands in
-- the feed; the next run picks up whatever goes on to earn an audience.

--------------------------------------------------------------------------------
-- 7. SOURCE -> TOPIC LINKS
--------------------------------------------------------------------------------
-- Mandatory for every discovery source, and enforced twice: runDiscoverySource
-- throws SOURCE_TOPICS_MISSING without them, and the assertion below fails this
-- migration. A discovery source with no declared topic is scored against every
-- alias in the table and will attach anything it finds to any topic.
INSERT INTO public.source_topics (source_id, topic_id)
SELECT s.id, t.id
FROM (
  VALUES
    ('DEV.to — React',        'React'),
    ('DEV.to — Next.js',      'Next.js'),
    ('DEV.to — TypeScript',   'TypeScript'),
    ('DEV.to — Supabase',     'Supabase'),
    ('DEV.to — OpenAI',       'OpenAI'),
    ('DEV.to — GitHub',       'GitHub'),
    ('DEV.to — Vercel',       'Vercel'),
    ('DEV.to — Hugging Face', 'Hugging Face'),
    ('DEV.to — NVIDIA',       'NVIDIA'),

    ('Stack Overflow — React',        'React'),
    ('Stack Overflow — Next.js',      'Next.js'),
    ('Stack Overflow — TypeScript',   'TypeScript'),
    ('Stack Overflow — Supabase',     'Supabase'),
    ('Stack Overflow — OpenAI',       'OpenAI'),
    ('Stack Overflow — GitHub',       'GitHub'),
    ('Stack Overflow — Vercel',       'Vercel'),
    ('Stack Overflow — Hugging Face', 'Hugging Face'),

    ('GitHub Releases — Next.js',      'Next.js'),
    ('GitHub Releases — React',        'React'),
    ('GitHub Releases — TypeScript',   'TypeScript'),
    ('GitHub Releases — Supabase',     'Supabase'),
    ('GitHub Releases — OpenAI',       'OpenAI'),
    ('GitHub Releases — Hugging Face', 'Hugging Face'),
    ('GitHub Releases — Resend',       'Resend'),
    ('GitHub Releases — Neon',         'Neon'),
    ('GitHub Releases — Vercel',       'Vercel'),
    ('GitHub Releases — NVIDIA',       'NVIDIA'),
    ('GitHub Releases — GitHub',       'GitHub')
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
  WHERE s.source_type IN ('hacker_news', 'dev_to', 'stack_exchange', 'github_releases', 'youtube')
    AND NOT EXISTS (SELECT 1 FROM public.source_topics st WHERE st.source_id = s.id);

  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Discovery sources without a source_topics row: %', orphans;
  END IF;
END $$;

-- Every topic named above must exist, or a JOIN above silently dropped a
-- source's only topic link and the assertion would not have caught it (the
-- source row itself would be missing too, since both come from the same names).
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(expected.topic_name, ', ') INTO missing
  FROM (VALUES
    ('React'), ('Next.js'), ('TypeScript'), ('Supabase'), ('OpenAI'),
    ('GitHub'), ('Vercel'), ('Hugging Face'), ('NVIDIA'), ('Resend'), ('Neon')
  ) AS expected(topic_name)
  WHERE NOT EXISTS (SELECT 1 FROM public.topics t WHERE t.name = expected.topic_name);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Discovery seed references topics that do not exist: %', missing;
  END IF;
END $$;
