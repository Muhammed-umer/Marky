-- Migration: qualification gate storage
--
-- Step 2 of the Marky Discovery Map. Every candidate is scored before it is
-- stored; rejections are logged with a reason so the rules can be judged on
-- real data before anyone reaches for embeddings or an LLM.
--
-- 1. discovery_candidates - the reject log (and an accept trail).
-- 2. topic_aliases        - keyword lists move from code to rows, so adding a
--                           topic becomes a data change.
-- 3. content_items.is_hidden - lets the backfill retire a poor item without
--                           deleting it and cascading away someone's saved row.

--------------------------------------------------------------------------------
-- 1. DISCOVERY_CANDIDATES
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url_hash TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  score NUMERIC(4, 3) CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  reason TEXT NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One verdict per URL per day: a feed that keeps re-offering the same rejected
-- item should not be able to fill the log.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_candidates_url_day_idx
  ON public.discovery_candidates (url_hash, ((created_at AT TIME ZONE 'UTC')::date));
CREATE INDEX IF NOT EXISTS discovery_candidates_decision_idx
  ON public.discovery_candidates (decision, created_at DESC);
CREATE INDEX IF NOT EXISTS discovery_candidates_reason_idx
  ON public.discovery_candidates (reason);
CREATE INDEX IF NOT EXISTS discovery_candidates_source_idx
  ON public.discovery_candidates (source_id);

ALTER TABLE public.discovery_candidates ENABLE ROW LEVEL SECURITY;

-- Internal table: no Data API access for authenticated users, matching
-- ingestion_runs in the baseline schema.
DROP POLICY IF EXISTS discovery_candidates_no_access ON public.discovery_candidates;
CREATE POLICY discovery_candidates_no_access ON public.discovery_candidates FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

GRANT ALL ON public.discovery_candidates TO service_role;

--------------------------------------------------------------------------------
-- 2. TOPIC_ALIASES
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.topic_aliases (
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (char_length(alias) BETWEEN 2 AND 80),
  weight NUMERIC(3, 2) NOT NULL DEFAULT 1.00 CHECK (weight > 0 AND weight <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, alias)
);

CREATE INDEX IF NOT EXISTS topic_aliases_alias_idx ON public.topic_aliases (alias);

ALTER TABLE public.topic_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topic_aliases_read ON public.topic_aliases;
CREATE POLICY topic_aliases_read ON public.topic_aliases FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.topic_aliases TO authenticated;
GRANT ALL ON public.topic_aliases TO service_role;

-- Seeded from the keyword lists in src/lib/ingestion/classify.ts so behaviour is
-- identical on day one.
INSERT INTO public.topic_aliases (topic_id, alias)
SELECT t.id, mapping.alias
FROM (
  VALUES
    ('OpenAI', 'openai'), ('OpenAI', 'chatgpt'), ('OpenAI', 'gpt-'), ('OpenAI', 'codex'), ('OpenAI', 'sora'),
    ('Hugging Face', 'hugging face'), ('Hugging Face', 'huggingface'), ('Hugging Face', 'transformers'), ('Hugging Face', 'spaces'),
    ('NVIDIA', 'nvidia'), ('NVIDIA', 'cuda'), ('NVIDIA', 'geforce'), ('NVIDIA', 'dgx'),
    ('Google / Google DeepMind', 'google'), ('Google / Google DeepMind', 'deepmind'), ('Google / Google DeepMind', 'gemini'), ('Google / Google DeepMind', 'tensorflow'),
    ('Vercel', 'vercel'), ('Vercel', 'turbopack'), ('Vercel', 'ai sdk'),
    ('Supabase', 'supabase'),
    ('Resend', 'resend'),
    ('Next.js', 'next.js'), ('Next.js', 'nextjs'),
    ('React', 'react'), ('React', 'reactjs'),
    ('TypeScript', 'typescript'), ('TypeScript', 'tsconfig'),
    ('GitHub', 'github'), ('GitHub', 'github actions'), ('GitHub', 'github copilot'),
    ('Neon', 'neon'), ('Neon', 'neon postgres')
) AS mapping(topic_name, alias)
JOIN public.topics t ON t.name = mapping.topic_name
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 3. SOURCES.TRUST_TIER
--------------------------------------------------------------------------------
-- Source trust is 20% of the qualification score, so it has to be data. Every
-- seeded source is an official publisher feed; discovery adapters in a later
-- step introduce the community and probationary tiers.
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'official'
  CHECK (trust_tier IN ('official', 'community', 'probationary', 'unknown'));

UPDATE public.sources SET trust_tier = 'community' WHERE source_type = 'medium_rss';

--------------------------------------------------------------------------------
-- 4. CONTENT_ITEMS.IS_HIDDEN
--------------------------------------------------------------------------------
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Marks a row as having been through the one-off re-extraction pass, so the
-- backfill is resumable and does not retry the same failures forever.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS backfilled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS content_items_backfill_pending_idx
  ON public.content_items (fetched_at)
  WHERE backfilled_at IS NULL;

-- The feed reads visible items constantly; a partial index keeps that cheap.
CREATE INDEX IF NOT EXISTS content_items_visible_published_idx
  ON public.content_items (published_at DESC NULLS LAST)
  WHERE is_hidden = false;
