-- Migration: source -> topic links, real engagement signals, link-processing cron
--
-- Step 1 of the Marky Discovery Map. Additive only: the authoritative baseline
-- (20260904000000) drops every table at the top and must never be edited.
--
-- 1. source_topics       - a source declares its topics instead of the classifier
--                          guessing from the source name ("Google Blog" matched
--                          the keyword "google" on every item it published).
-- 2. content_item_signals - somewhere real engagement and independent-source
--                          counts can live; the feed currently hardcodes 0 and 1,
--                          which leaves two of trendingScore's four terms dead.
-- 3. sources.max_article_age_days - already read by src/lib/ingestion/generic-rss.ts
--                          but absent from the schema, so a hardcoded source-name
--                          list was the only thing keeping low-frequency blogs alive.
-- 4. A cron job for /api/cron/process-links, which nothing scheduled before.

--------------------------------------------------------------------------------
-- 1. SOURCE_TOPICS
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.source_topics (
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, topic_id)
);

CREATE INDEX IF NOT EXISTS source_topics_topic_idx ON public.source_topics(topic_id);

ALTER TABLE public.source_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS source_topics_read ON public.source_topics;
CREATE POLICY source_topics_read ON public.source_topics FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.source_topics TO authenticated;
GRANT ALL ON public.source_topics TO service_role;

-- Seed the 13 baseline sources. Matching on name keeps this idempotent and
-- survives the baseline's ON CONFLICT DO NOTHING source seed.
INSERT INTO public.source_topics (source_id, topic_id)
SELECT s.id, t.id
FROM (
  VALUES
    ('OpenAI News', 'OpenAI'),
    ('Hugging Face Blog', 'Hugging Face'),
    ('NVIDIA Blog', 'NVIDIA'),
    ('Google DeepMind Blog', 'Google / Google DeepMind'),
    ('Google Blog', 'Google / Google DeepMind'),
    ('Vercel Blog', 'Vercel'),
    ('Supabase Blog', 'Supabase'),
    ('Resend Blog', 'Resend'),
    ('Next.js Blog', 'Next.js'),
    ('React Blog', 'React'),
    ('TypeScript Blog', 'TypeScript'),
    ('GitHub Blog', 'GitHub'),
    ('Neon Blog', 'Neon')
) AS mapping(source_name, topic_name)
JOIN public.sources s ON s.name = mapping.source_name
JOIN public.topics t ON t.name = mapping.topic_name
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 2. CONTENT_ITEM_SIGNALS
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_item_signals (
  content_item_id UUID PRIMARY KEY REFERENCES public.content_items(id) ON DELETE CASCADE,
  engagement_count INTEGER NOT NULL DEFAULT 0 CHECK (engagement_count >= 0),
  source_count INTEGER NOT NULL DEFAULT 1 CHECK (source_count >= 1),
  platform TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_item_signals_engagement_idx
  ON public.content_item_signals(engagement_count DESC);

ALTER TABLE public.content_item_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_item_signals_read ON public.content_item_signals;
CREATE POLICY content_item_signals_read ON public.content_item_signals FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.content_item_signals TO authenticated;
GRANT ALL ON public.content_item_signals TO service_role;

--------------------------------------------------------------------------------
-- 3. SOURCES: per-source article age window, faster default refresh
--------------------------------------------------------------------------------
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS max_article_age_days INTEGER
  CHECK (max_article_age_days IS NULL OR max_article_age_days > 0);

-- The React and TypeScript blogs publish rarely; a 30-day window starves them.
UPDATE public.sources SET max_article_age_days = 365
WHERE name IN ('React Blog', 'TypeScript Blog') AND max_article_age_days IS NULL;

-- pg_cron ticks every 15 minutes but isDue() held sources for 30, making the
-- effective refresh ~45 minutes.
UPDATE public.sources SET fetch_interval_minutes = 15
WHERE fetch_interval_minutes = 30;

--------------------------------------------------------------------------------
-- 4. LINK PROCESSING CRON
--------------------------------------------------------------------------------
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN
        SELECT jobid FROM cron.job WHERE jobname = 'marky-link-processing-cron'
    LOOP
        PERFORM cron.unschedule(job_record.jobid);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.trigger_marky_link_processing();

-- Derives the worker URL from the existing marky_cron_url secret so no new Vault
-- entry is required; an explicit marky_links_cron_url secret overrides it.
CREATE FUNCTION public.trigger_marky_link_processing()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cron_url text;
    cron_secret text;
    request_id bigint;
BEGIN
    SELECT decrypted_secret INTO cron_url
    FROM vault.decrypted_secrets WHERE name = 'marky_links_cron_url';

    IF cron_url IS NULL OR cron_url = '' THEN
        SELECT regexp_replace(decrypted_secret, '/api/cron/ingest/?$', '/api/cron/process-links')
        INTO cron_url
        FROM vault.decrypted_secrets WHERE name = 'marky_cron_url';
    END IF;

    SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets WHERE name = 'marky_cron_secret';

    IF cron_url IS NULL OR cron_url = '' THEN
        RAISE EXCEPTION 'marky_cron_url is not configured';
    END IF;

    IF cron_url NOT LIKE '%/api/cron/process-links' THEN
        RAISE EXCEPTION 'link processing URL could not be derived from marky_cron_url';
    END IF;

    IF cron_secret IS NULL OR cron_secret = '' THEN
        RAISE EXCEPTION 'marky_cron_secret is not configured';
    END IF;

    SELECT net.http_post(
        url := cron_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || cron_secret
        ),
        body := '{}'::jsonb
    )
    INTO request_id;

    RETURN request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_marky_link_processing() TO postgres, service_role;

SELECT cron.schedule(
    'marky-link-processing-cron',
    '* * * * *',
    'SELECT public.trigger_marky_link_processing();'
);
