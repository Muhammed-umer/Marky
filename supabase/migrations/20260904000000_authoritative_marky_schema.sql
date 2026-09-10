-- Migration: Authoritative Marky Database Schema Baseline
-- Single clean baseline for Marky V1:
-- 1. profiles
-- 2. topics
-- 3. user_topics
-- 4. sources
-- 5. content_items
-- 6. content_item_topics
-- 7. saved_items
-- 8. user_submissions
-- 9. ingestion_runs

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgmq;

--------------------------------------------------------------------------------
-- DROP LEGACY & EXISTING TABLES (Clean Development Baseline)
--------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.content_events CASCADE;
DROP TABLE IF EXISTS public.user_interest_affinities CASCADE;
DROP TABLE IF EXISTS public.link_submissions CASCADE;
DROP TABLE IF EXISTS public.content_item_sources CASCADE;
DROP TABLE IF EXISTS public.content_item_interests CASCADE;
DROP TABLE IF EXISTS public.content_item_topics CASCADE;
DROP TABLE IF EXISTS public.saved_items CASCADE;
DROP TABLE IF EXISTS public.user_submissions CASCADE;
DROP TABLE IF EXISTS public.user_interests CASCADE;
DROP TABLE IF EXISTS public.user_topics CASCADE;
DROP TABLE IF EXISTS public.interests CASCADE;
DROP TABLE IF EXISTS public.topics CASCADE;
DROP TABLE IF EXISTS public.ingestion_runs CASCADE;
DROP TABLE IF EXISTS public.content_items CASCADE;
DROP TABLE IF EXISTS public.sources CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.content_event_type CASCADE;
DROP TYPE IF EXISTS public.source_type CASCADE;
DROP TYPE IF EXISTS public.publication_time_status CASCADE;
DROP TYPE IF EXISTS public.ingestion_status CASCADE;

--------------------------------------------------------------------------------
-- 1. PROFILES
--------------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX profiles_clerk_user_id_idx ON public.profiles(clerk_user_id);

--------------------------------------------------------------------------------
-- 2. TOPICS
--------------------------------------------------------------------------------
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('company', 'tool', 'framework', 'platform', 'concept')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 3. USER_TOPICS
--------------------------------------------------------------------------------
CREATE TABLE public.user_topics (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX user_topics_user_idx ON public.user_topics(user_id);
CREATE INDEX user_topics_topic_idx ON public.user_topics(topic_id);

--------------------------------------------------------------------------------
-- 4. SOURCES
--------------------------------------------------------------------------------
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss', 'atom', 'api', 'web', 'platform', 'medium_rss')),
  feed_url TEXT,
  site_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  fetch_interval_minutes INTEGER DEFAULT 30 CHECK (fetch_interval_minutes >= 5),
  etag TEXT,
  last_modified TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sources_is_active_idx ON public.sources(is_active);

--------------------------------------------------------------------------------
-- 5. CONTENT_ITEMS
--------------------------------------------------------------------------------
CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  external_id TEXT,
  canonical_url TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  body_content TEXT,
  author TEXT,
  image_url TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX content_items_source_idx ON public.content_items(source_id);
CREATE INDEX content_items_published_at_idx ON public.content_items(published_at DESC NULLS LAST);
CREATE INDEX content_items_fetched_at_idx ON public.content_items(fetched_at DESC);
CREATE INDEX content_items_url_hash_idx ON public.content_items(url_hash);

--------------------------------------------------------------------------------
-- 6. CONTENT_ITEM_TOPICS
--------------------------------------------------------------------------------
CREATE TABLE public.content_item_topics (
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  PRIMARY KEY (content_item_id, topic_id)
);

CREATE INDEX content_item_topics_topic_idx ON public.content_item_topics(topic_id);

--------------------------------------------------------------------------------
-- 7. SAVED_ITEMS
--------------------------------------------------------------------------------
CREATE TABLE public.saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, content_item_id)
);

CREATE INDEX saved_items_user_idx ON public.saved_items(user_id, saved_at DESC);
CREATE INDEX saved_items_content_item_idx ON public.saved_items(content_item_id);

--------------------------------------------------------------------------------
-- 8. USER_SUBMISSIONS
--------------------------------------------------------------------------------
CREATE TABLE public.user_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_url TEXT NOT NULL CHECK (char_length(submitted_url) <= 2048),
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  note TEXT CHECK (char_length(note) <= 2000),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX user_submissions_user_idx ON public.user_submissions(user_id, submitted_at DESC);
CREATE INDEX user_submissions_status_idx ON public.user_submissions(status, submitted_at);

--------------------------------------------------------------------------------
-- 9. INGESTION_RUNS
--------------------------------------------------------------------------------
CREATE TABLE public.ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  items_seen INTEGER DEFAULT 0 CHECK (items_seen >= 0),
  items_inserted INTEGER DEFAULT 0 CHECK (items_inserted >= 0),
  items_updated INTEGER DEFAULT 0 CHECK (items_updated >= 0),
  items_skipped INTEGER DEFAULT 0 CHECK (items_skipped >= 0),
  error_count INTEGER DEFAULT 0 CHECK (error_count >= 0),
  error_message TEXT
);

CREATE INDEX ingestion_runs_source_idx ON public.ingestion_runs(source_id);
CREATE INDEX ingestion_runs_started_idx ON public.ingestion_runs(started_at DESC);

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_item_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users manage only their own profile
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (clerk_user_id = ((SELECT auth.jwt()) ->> 'sub'));
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (clerk_user_id = ((SELECT auth.jwt()) ->> 'sub'));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (clerk_user_id = ((SELECT auth.jwt()) ->> 'sub'))
  WITH CHECK (clerk_user_id = ((SELECT auth.jwt()) ->> 'sub'));

-- Topics: Read-only for authenticated users
CREATE POLICY topics_read ON public.topics FOR SELECT TO authenticated USING (true);

-- User Topics: Users manage only their own topic selections
CREATE POLICY user_topics_own ON public.user_topics FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')));

-- Sources: Read-only for authenticated users
CREATE POLICY sources_read ON public.sources FOR SELECT TO authenticated USING (true);

-- Content Items: Read-only for authenticated users
CREATE POLICY content_items_read ON public.content_items FOR SELECT TO authenticated USING (true);

-- Content Item Topics: Read-only for authenticated users
CREATE POLICY content_item_topics_read ON public.content_item_topics FOR SELECT TO authenticated USING (true);

-- Saved Items: Users manage only their own saved items
CREATE POLICY saved_items_own ON public.saved_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')));

-- User Submissions: Users manage/read only their own submissions
CREATE POLICY user_submissions_read_own ON public.user_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')));
CREATE POLICY user_submissions_insert_own ON public.user_submissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.clerk_user_id = ((SELECT auth.jwt()) ->> 'sub')));

-- Ingestion Runs: Internal table, no Data API access for authenticated users
CREATE POLICY ingestion_runs_no_access ON public.ingestion_runs FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

--------------------------------------------------------------------------------
-- TABLE GRANTS
--------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.topics, public.sources, public.content_items, public.content_item_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_topics, public.saved_items TO authenticated;
GRANT SELECT, INSERT ON public.user_submissions TO authenticated;

GRANT ALL ON public.profiles, public.topics, public.user_topics, public.sources,
             public.content_items, public.content_item_topics, public.saved_items,
             public.user_submissions, public.ingestion_runs TO service_role;

--------------------------------------------------------------------------------
-- PGMQ LINK INGESTION QUEUE WRAPPERS
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.meta WHERE queue_name = 'link_ingestion') THEN
    PERFORM pgmq.create('link_ingestion');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_link_ingestion(message JSONB)
RETURNS BIGINT LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path = ''
AS $$ SELECT pgmq.send('link_ingestion', message, 0); $$;

CREATE OR REPLACE FUNCTION public.dequeue_link_ingestion(batch_size INTEGER DEFAULT 3)
RETURNS TABLE (msg_id BIGINT, read_ct INTEGER, message JSONB)
LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT q.msg_id, q.read_ct, q.message
  FROM pgmq.read('link_ingestion', 60, LEAST(GREATEST(batch_size, 1), 10)) q;
$$;

CREATE OR REPLACE FUNCTION public.delete_link_ingestion(message_id BIGINT)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path = ''
AS $$ SELECT pgmq.delete('link_ingestion', message_id); $$;

REVOKE EXECUTE ON FUNCTION public.enqueue_link_ingestion(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dequeue_link_ingestion(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_link_ingestion(BIGINT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_link_ingestion(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.dequeue_link_ingestion(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_link_ingestion(BIGINT) TO service_role;

--------------------------------------------------------------------------------
-- SEED DATA: TOPICS
--------------------------------------------------------------------------------
INSERT INTO public.topics (name, slug, category, description) VALUES
  ('OpenAI', 'openai', 'company', 'OpenAI models, products, research, and developer updates'),
  ('Hugging Face', 'hugging-face', 'company', 'Hugging Face models, libraries, and community tooling'),
  ('NVIDIA', 'nvidia', 'company', 'NVIDIA AI, accelerated computing, and developer updates'),
  ('Google / Google DeepMind', 'google-deepmind', 'company', 'Google and Google DeepMind AI and developer updates'),
  ('Vercel', 'vercel', 'company', 'Vercel platform, framework, and product updates'),
  ('Supabase', 'supabase', 'platform', 'Supabase platform and developer updates'),
  ('Resend', 'resend', 'platform', 'Resend email platform and developer updates'),
  ('Next.js', 'nextjs', 'framework', 'Next.js framework and release updates'),
  ('React', 'react', 'framework', 'React library and ecosystem updates'),
  ('TypeScript', 'typescript', 'concept', 'TypeScript language and tooling updates'),
  ('GitHub', 'github', 'platform', 'GitHub platform, Actions, and developer updates'),
  ('Neon', 'neon', 'platform', 'Neon Postgres platform and developer updates')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

--------------------------------------------------------------------------------
-- SEED DATA: SOURCES
--------------------------------------------------------------------------------
INSERT INTO public.sources (name, source_type, feed_url, site_url, fetch_interval_minutes, is_active) VALUES
  ('OpenAI News', 'rss', 'https://openai.com/news/rss.xml', 'https://openai.com/news/', 30, true),
  ('Hugging Face Blog', 'rss', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co/blog', 30, true),
  ('NVIDIA Blog', 'rss', 'https://blogs.nvidia.com/feed/', 'https://blogs.nvidia.com/', 30, true),
  ('Google DeepMind Blog', 'rss', 'https://deepmind.google/blog/rss.xml', 'https://deepmind.google/blog', 30, true),
  ('Google Blog', 'rss', 'https://blog.google/rss/', 'https://blog.google/', 30, true),
  ('Vercel Blog', 'rss', 'https://vercel.com/blog/feed.xml', 'https://vercel.com/blog', 30, true),
  ('Supabase Blog', 'rss', 'https://supabase.com/feed.xml', 'https://supabase.com/blog', 30, true),
  ('Resend Blog', 'rss', 'https://resend.com/blog/rss.xml', 'https://resend.com/blog', 30, true),
  ('Next.js Blog', 'rss', 'https://nextjs.org/feed.xml', 'https://nextjs.org/blog', 30, true),
  ('React Blog', 'rss', 'https://react.dev/rss.xml', 'https://react.dev/blog', 30, true),
  ('TypeScript Blog', 'rss', 'https://devblogs.microsoft.com/typescript/feed/', 'https://devblogs.microsoft.com/typescript/', 30, true),
  ('GitHub Blog', 'rss', 'https://github.blog/feed/', 'https://github.blog/', 30, true),
  ('Neon Blog', 'rss', 'https://neon.tech/blog/rss.xml', 'https://neon.tech/blog', 30, true)
ON CONFLICT DO NOTHING;
