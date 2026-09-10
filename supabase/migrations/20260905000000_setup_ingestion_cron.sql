-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- 2. Remove existing Marky cron jobs
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN
        SELECT jobid
        FROM cron.job
        WHERE jobname LIKE 'marky-ingestion%'
    LOOP
        PERFORM cron.unschedule(job_record.jobid);
    END LOOP;
END $$;


-- 3. Remove old function
DROP FUNCTION IF EXISTS public.trigger_marky_ingestion();


-- 4. Create ingestion trigger using Supabase Vault
CREATE FUNCTION public.trigger_marky_ingestion()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cron_url text;
    cron_secret text;
    request_id bigint;
BEGIN

    SELECT decrypted_secret
    INTO cron_url
    FROM vault.decrypted_secrets
    WHERE name = 'marky_cron_url';

    SELECT decrypted_secret
    INTO cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'marky_cron_secret';

    IF cron_url IS NULL OR cron_url = '' THEN
        RAISE EXCEPTION 'marky_cron_url is not configured';
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


-- 5. Grant execution permission
GRANT EXECUTE
ON FUNCTION public.trigger_marky_ingestion()
TO postgres, service_role;


-- 6. Create the 15-minute cron
SELECT cron.schedule(
    'marky-ingestion-cron',
    '*/15 * * * *',
    'SELECT public.trigger_marky_ingestion();'
);