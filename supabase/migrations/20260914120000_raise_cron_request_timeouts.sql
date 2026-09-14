--------------------------------------------------------------------------------
-- CRON REQUEST TIMEOUTS
--------------------------------------------------------------------------------
-- None of the three trigger functions passed timeout_milliseconds to
-- net.http_post, so pg_net (0.20.4 on the live project) used its 5 s default.
-- The ingest and discovery routes legitimately run for up to 60 s (maxDuration),
-- and on 2026-09-14 the production function stopped reaching its first
-- ingestion_runs insert inside 5 s: every tick from 11:30 UTC logged
-- "Timeout of 5000 ms reached" in net._http_response and recorded nothing,
-- while the same routes answered 200 to a direct call with no timeout.
--
-- 65 s covers the routes' full budget plus a cold start. pg_net waits
-- asynchronously, so a longer timeout never blocks pg_cron.
--
-- The function bodies are otherwise the ones from
-- 20260910020000_split_discovery_cron.sql (ingestion, discovery) and
-- 20260909000000_add_source_topics_signals_and_link_cron.sql (link processing).
--------------------------------------------------------------------------------

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
        url := cron_url || (CASE WHEN position('?' in cron_url) > 0 THEN '&' ELSE '?' END) || 'kind=feeds',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || cron_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 65000
    ) INTO request_id;

    RETURN request_id;
END;
$$;

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
        body := '{}'::jsonb,
        timeout_milliseconds := 65000
    ) INTO request_id;

    RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_marky_link_processing()
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
        body := '{}'::jsonb,
        timeout_milliseconds := 65000
    )
    INTO request_id;

    RETURN request_id;
END;
$$;

-- Grants are unchanged by CREATE OR REPLACE, restated so a fresh database
-- applying this file alone ends in the same state.
GRANT EXECUTE ON FUNCTION public.trigger_marky_ingestion() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.trigger_marky_discovery() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.trigger_marky_link_processing() TO postgres, service_role;
