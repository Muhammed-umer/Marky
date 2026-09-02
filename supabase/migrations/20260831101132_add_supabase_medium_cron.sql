create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.ingestion_secrets (
  name text primary key,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.ingestion_secrets from public, anon, authenticated;

create or replace function public.verify_ingestion_cron_secret(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.ingestion_secrets
    where name = 'medium_cron'
      and secret_hash = encode(extensions.digest(candidate, 'sha256'), 'hex')
  );
$$;

revoke execute on function public.verify_ingestion_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_ingestion_cron_secret(text) to service_role;

alter table public.sources drop constraint if exists sources_fetch_interval_minutes_check;
alter table public.sources
  add constraint sources_fetch_interval_minutes_check
  check (fetch_interval_minutes between 5 and 60);

update public.sources
set fetch_interval_minutes = 5
where source_type = 'medium_rss';

select cron.schedule(
  'marky-medium-ingestion-5m',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'marky_project_url') || '/functions/v1/ingest-medium',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'marky_medium_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);
