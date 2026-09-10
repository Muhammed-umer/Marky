--------------------------------------------------------------------------------
-- GET_INGESTION_CRON_STATUS
--------------------------------------------------------------------------------
-- /debug/ingestion calls this RPC to show whether the scheduler is actually
-- running. The function was never created, so the call returned PGRST202 and
-- the page has been reporting "NOT CONFIGURED / PENDING MIGRATION" regardless
-- of the real state -- the one panel that would have revealed a stalled cron
-- was itself broken.
--
-- The cron schema is not exposed through the Data API, so a SECURITY DEFINER
-- function is the only way to read it. It is deliberately narrow: it returns
-- the Marky ingestion jobs and nothing else, and EXECUTE is granted only to
-- service_role, which is the key the server-side debug page already uses.
-- authenticated is explicitly revoked so a signed-in browser cannot enumerate
-- scheduled jobs or read the command string, which contains a Vault lookup.
CREATE OR REPLACE FUNCTION public.get_ingestion_cron_status()
RETURNS TABLE (
  jobid BIGINT,
  schedule TEXT,
  command TEXT,
  active BOOLEAN,
  jobname TEXT,
  last_run_started_at TIMESTAMPTZ,
  last_run_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = cron, pg_catalog
AS $$
  SELECT
    j.jobid,
    j.schedule::TEXT,
    j.command::TEXT,
    j.active,
    j.jobname::TEXT,
    r.start_time,
    r.status::TEXT
  FROM cron.job j
  -- Most recent run for this job, if pg_cron has recorded one yet.
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.status
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON TRUE
  WHERE j.jobname LIKE 'marky-%'
  ORDER BY j.jobname;
$$;

REVOKE ALL ON FUNCTION public.get_ingestion_cron_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ingestion_cron_status() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_ingestion_cron_status() TO service_role;
