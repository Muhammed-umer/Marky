--------------------------------------------------------------------------------
-- MEDIUM TAG FEEDS AS A COMMUNITY-TIER SOURCE
--------------------------------------------------------------------------------
-- Until now every seeded source has been an official publisher blog: trustworthy
-- but thin, one blog per topic and a handful of posts a week.
--
-- These are the first community-tier sources. Medium is untrusted by nature --
-- anyone can publish under a tag -- so this is only safe because the
-- qualification gate now scores every candidate before storage and reads
-- sources.trust_tier. At 'community' the trust factor contributes 0.7 instead of
-- 1.0, so a Medium post must be more relevant and more substantial than an
-- official post to clear the 0.6 threshold.
--
-- They are seeded as source_type 'rss', NOT 'medium_rss', deliberately. The
-- legacy medium_rss adapter (src/lib/ingestion/medium.ts) never calls the
-- qualification gate, ignores source_topics and skips the DNS-level SSRF check.
-- The generic RSS adapter does all three, and a Medium tag feed is ordinary RSS.
--
-- This reverses the prohibition in docs/TOPIC_SOURCE_STRATEGY.md, which banned
-- tag aggregation on 2026-09-04. The reason for that ban was the absence of a
-- quality gate; that reason no longer holds. The doc is rewritten alongside this
-- migration rather than left to contradict it.
--
-- TWO TOPICS ARE DELIBERATELY NOT SEEDED:
--   Resend -- its only alias is the bare English word "resend", so the Medium
--     tag (dominated by "how to resend an OTP" tutorials) would score
--     relevance 1.0 on a title match and store junk under the topic.
--   Neon   -- the "neon" tag is neon signs, neon art and neon UI palettes, and
--     the alias list contains the bare word "neon", so the same trap applies.
-- Both need a discovery source that is not a tag aggregation. Leaving them out
-- is better than poisoning two topics.
--------------------------------------------------------------------------------

-- last_fetched_at is staggered so the first due-wave does not land on one cron
-- tick. isDue() reads `last_success_at ?? last_fetched_at`, and last_success_at
-- is left NULL because nothing has actually succeeded yet -- the debug page and
-- any future alerting must keep telling the truth about that.
INSERT INTO public.sources
  (name, source_type, feed_url, site_url, trust_tier, fetch_interval_minutes, max_article_age_days, is_active, last_fetched_at)
VALUES
  ('Medium — OpenAI',       'rss', 'https://medium.com/feed/tag/openai',       'https://medium.com/tag/openai',       'community', 60, 14, true, now() - interval '54 minutes'),
  ('Medium — Hugging Face', 'rss', 'https://medium.com/feed/tag/hugging-face', 'https://medium.com/tag/hugging-face', 'community', 60, 14, true, now() - interval '48 minutes'),
  ('Medium — NVIDIA',       'rss', 'https://medium.com/feed/tag/nvidia',       'https://medium.com/tag/nvidia',       'community', 60, 14, true, now() - interval '42 minutes'),
  -- 'deepmind' rather than 'google': the google tag is far too broad to be
  -- scoped by an alias list that includes the bare word "google".
  ('Medium — Google DeepMind', 'rss', 'https://medium.com/feed/tag/deepmind',  'https://medium.com/tag/deepmind',     'community', 60, 14, true, now() - interval '36 minutes'),
  ('Medium — Vercel',       'rss', 'https://medium.com/feed/tag/vercel',       'https://medium.com/tag/vercel',       'community', 60, 14, true, now() - interval '30 minutes'),
  ('Medium — Supabase',     'rss', 'https://medium.com/feed/tag/supabase',     'https://medium.com/tag/supabase',     'community', 60, 14, true, now() - interval '24 minutes'),
  ('Medium — Next.js',      'rss', 'https://medium.com/feed/tag/nextjs',       'https://medium.com/tag/nextjs',       'community', 60, 14, true, now() - interval '18 minutes'),
  -- 'reactjs' rather than 'react', which collides with React Native and with
  -- non-technical uses of the word.
  ('Medium — React',        'rss', 'https://medium.com/feed/tag/reactjs',      'https://medium.com/tag/reactjs',      'community', 60, 14, true, now() - interval '12 minutes'),
  ('Medium — TypeScript',   'rss', 'https://medium.com/feed/tag/typescript',   'https://medium.com/tag/typescript',   'community', 60, 14, true, now() - interval '6 minutes'),
  ('Medium — GitHub',       'rss', 'https://medium.com/feed/tag/github',       'https://medium.com/tag/github',       'community', 60, 14, true, now())
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- SOURCE -> TOPIC LINKS
--------------------------------------------------------------------------------
-- Not optional. loadSourceQualificationContext (src/lib/qualification/store.ts)
-- scores a source against EVERY topic alias when it declares no topics of its
-- own. A Medium source without a row here would accept a post about any of the
-- 12 topics -- exactly the cross-topic contamination the gate exists to prevent.
INSERT INTO public.source_topics (source_id, topic_id)
SELECT s.id, t.id
FROM (
  VALUES
    ('Medium — OpenAI',          'OpenAI'),
    ('Medium — Hugging Face',    'Hugging Face'),
    ('Medium — NVIDIA',          'NVIDIA'),
    ('Medium — Google DeepMind', 'Google / Google DeepMind'),
    ('Medium — Vercel',          'Vercel'),
    ('Medium — Supabase',        'Supabase'),
    ('Medium — Next.js',         'Next.js'),
    ('Medium — React',           'React'),
    ('Medium — TypeScript',      'TypeScript'),
    ('Medium — GitHub',          'GitHub')
) AS mapping(source_name, topic_name)
JOIN public.sources s ON s.name = mapping.source_name
JOIN public.topics  t ON t.name = mapping.topic_name
ON CONFLICT DO NOTHING;

-- Migrations run in a transaction, so an orphan rolls this whole file back
-- rather than leaving sources seeded with no topic scope. The adapter carries
-- the same check at runtime (SOURCE_TOPICS_MISSING) for sources added by hand.
DO $$
DECLARE
  orphans TEXT;
BEGIN
  SELECT string_agg(s.name, ', ') INTO orphans
  FROM public.sources s
  WHERE s.feed_url LIKE 'https://medium.com/feed/tag/%'
    AND NOT EXISTS (SELECT 1 FROM public.source_topics st WHERE st.source_id = s.id);

  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Medium sources without a source_topics row: %', orphans;
  END IF;
END $$;
