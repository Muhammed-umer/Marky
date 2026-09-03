-- Supabase owns recurring execution; Vercel only hosts the Marky app and
-- protected worker endpoints. Secrets are configured in Vault outside source control.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'marky_worker_url') then
    raise exception 'Vault secret marky_worker_url must be configured before this migration';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'marky_worker_secret') then
    raise exception 'Vault secret marky_worker_secret must be configured before this migration';
  end if;
end;
$$;

do $$
declare
  scheduled_job record;
begin
  for scheduled_job in
    select jobid from cron.job
    where jobname in ('marky-medium-ingestion-5m', 'marky-ingest-sources-5m', 'marky-process-links-1m')
  loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'marky-ingest-sources-5m',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'marky_worker_url') || '/api/cron/ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'marky_worker_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);

select cron.schedule(
  'marky-process-links-1m',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'marky_worker_url') || '/api/cron/process-links',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'marky_worker_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);
