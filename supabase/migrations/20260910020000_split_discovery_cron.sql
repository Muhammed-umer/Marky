--------------------------------------------------------------------------------
-- SPLIT THE INGESTION CRON: FEEDS AND DISCOVERY
--------------------------------------------------------------------------------
-- One cron job has been calling /api/cron/ingest for every source since
-- 2026-09-05. That was fine for 13 publisher feeds. After the Medium, Hacker
-- News and free-discovery seeds there are 62 sources, and the two kinds cost
-- very different amounts of time:
--
--   * A feed source is one HTTP fetch and a parse.
--   * A discovery source fetches a search result and then up to a dozen
--     article pages, because Hacker News, DEV, Stack Exchange and the rest
--     hand over a link and a score rather than the article itself.
--
-- Measured at 16 sources, a tick was already ~122 seconds of source-time. The
-- route's maxDuration is 60 seconds, so a single job would start cutting runs
-- off mid-flight -- and a run cut off mid-flight leaves its ingestion_runs row
-- stranded in 'running' forever, which is also how the audit page loses track
-- of what actually happened.
--
-- Two jobs, each with its own 60-second budget, offset so they never overlap.
-- The route takes ?kind=, and defaults to "all" when it is absent, so an older
-- deployment keeps behaving exactly as it does today.
--------------------------------------------------------------------------------

-- 1. Feeds keep the existing function name and schedule; only the URL gains
--    the filter.
CREATE OR REPLACE FUNCTION public.trigger_marky_ingestion()
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
    FROM vault.decrypted_secrets WHERE name = 'marky_cron_url';

    SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets WHERE name = 'marky_cron_secret';

    IF cron_url IS NULL OR cron_url = '' THEN
        RAISE EXCEPTION 'marky_cron_url is not configured';
    END IF;
    IF cron_secret IS NULL OR cron_secret = '' THEN
        RAISE EXCEPTION 'marky_cron_secret is not configured';
    END IF;

    SELECT net.http_post(
        -- The stored secret may already carry a query string, so pick the
        -- separator rather than assuming one.
        url := cron_url || (CASE WHEN position('?' in cron_url) > 0 THEN '&' ELSE '?' END) || 'kind=feeds',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || cron_secret
        ),
        body := '{}'::jsonb
    ) INTO request_id;

    RETURN request_id;
END;
$$;

-- 2. Discovery gets its own trigger against the same endpoint.
CREATE OR REPLACE FUNCTION public.trigger_marky_discovery()
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
    FROM vault.decrypted_secrets WHERE name = 'marky_cron_url';

    SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets WHERE name = 'marky_cron_secret';

    IF cron_url IS NULL OR cron_url = '' THEN
        RAISE EXCEPTION 'marky_cron_url is not configured';
    END IF;
    IF cron_secret IS NULL OR cron_secret = '' THEN
        RAISE EXCEPTION 'marky_cron_secret is not configured';
    END IF;

    SELECT net.http_post(
        url := cron_url || (CASE WHEN position('?' in cron_url) > 0 THEN '&' ELSE '?' END) || 'kind=discovery',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || cron_secret
        ),
        body := '{}'::jsonb
    ) INTO request_id;

    RETURN request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_marky_discovery() TO postgres, service_role;

-- 3. Schedule discovery on its own tick, offset from the feed job so the two
--    never share the 60-second window.
DO $$
BEGIN
    PERFORM cron.unschedule('marky-discovery-cron');
EXCEPTION WHEN OTHERS THEN
    -- Not scheduled yet on a fresh project; nothing to remove.
    NULL;
END $$;

SELECT cron.schedule(
    'marky-discovery-cron',
    '7,22,37,52 * * * *',
    'SELECT public.trigger_marky_discovery();'
);
