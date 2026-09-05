-- Migration: Setup Supabase Cron (pg_cron) for Marky Ingestion
-- Description: Configures recurring pg_cron job to invoke Next.js /api/cron/ingest via pg_net HTTP POST request.
-- Security: Reads secrets dynamically from GUC app.settings variables at runtime to avoid hardcoding secrets.

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Function to trigger Marky ingestion HTTP endpoint via pg_net
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
    cron_url := current_setting('app.settings.marky_cron_url', true);
    cron_secret := current_setting('app.settings.cron_secret', true);

    IF cron_url IS NULL OR cron_url = '' THEN
        cron_url := 'http://localhost:3000/api/cron/ingest';
    END IF;

    IF cron_secret IS NULL OR cron_secret = '' THEN
        cron_secret := 'dev_cron_secret';
    END IF;

    SELECT net.http_post(
        url := cron_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || cron_secret
        ),
        body := '{}'::jsonb
    ) INTO request_id;

    RETURN request_id;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.trigger_marky_ingestion() TO postgres, service_role;

-- 3. Function to fetch pg_cron status safely for observability tools
CREATE OR REPLACE FUNCTION public.get_ingestion_cron_status()
RETURNS TABLE (
    jobid bigint,
    schedule text,
    command text,
    nodename text,
    nodeport integer,
    database text,
    username text,
    active boolean,
    jobname text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        j.jobid,
        j.schedule,
        j.command,
        j.nodename,
        j.nodeport,
        j.database,
        j.username,
        j.active,
        j.jobname
    FROM cron.job j
    WHERE j.jobname = 'marky-ingestion-cron';
$$;

-- Grant execution permissions for status check
GRANT EXECUTE ON FUNCTION public.get_ingestion_cron_status() TO postgres, service_role;

-- 4. Idempotently schedule/reschedule pg_cron job
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marky-ingestion-cron') THEN
        PERFORM cron.unschedule('marky-ingestion-cron');
    END IF;
    
    PERFORM cron.schedule('marky-ingestion-cron', '*/15 * * * *', 'SELECT public.trigger_marky_ingestion();');
END $$;
