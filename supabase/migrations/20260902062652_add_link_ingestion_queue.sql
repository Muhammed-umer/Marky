create extension if not exists pgmq;

do $$
begin
  if not exists (select 1 from pgmq.meta where queue_name = 'link_ingestion') then
    perform pgmq.create('link_ingestion');
  end if;
end;
$$;

create table public.link_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_url text not null check (char_length(submitted_url) <= 2048),
  note text check (char_length(note) <= 2000),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  content_item_id uuid references public.content_items(id) on delete set null,
  result_item jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index link_submissions_user_created_idx on public.link_submissions(user_id, created_at desc);
create index link_submissions_status_idx on public.link_submissions(status, created_at);
alter table public.link_submissions enable row level security;

create policy link_submissions_read_own on public.link_submissions
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = user_id and p.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  ));

grant select on public.link_submissions to authenticated;
grant select, insert, update, delete on public.link_submissions to service_role;

create or replace function public.enqueue_link_ingestion(message jsonb)
returns bigint language sql volatile security definer set search_path = ''
as $$ select pgmq.send('link_ingestion', message, 0); $$;

create or replace function public.dequeue_link_ingestion(batch_size integer default 3)
returns table (msg_id bigint, read_ct integer, message jsonb)
language sql volatile security definer set search_path = ''
as $$
  select q.msg_id, q.read_ct, q.message
  from pgmq.read('link_ingestion', 60, least(greatest(batch_size, 1), 10)) q;
$$;

create or replace function public.delete_link_ingestion(message_id bigint)
returns boolean language sql volatile security definer set search_path = ''
as $$ select pgmq.delete('link_ingestion', message_id); $$;

revoke execute on function public.enqueue_link_ingestion(jsonb) from public, anon, authenticated;
revoke execute on function public.dequeue_link_ingestion(integer) from public, anon, authenticated;
revoke execute on function public.delete_link_ingestion(bigint) from public, anon, authenticated;
grant execute on function public.enqueue_link_ingestion(jsonb) to service_role;
grant execute on function public.dequeue_link_ingestion(integer) to service_role;
grant execute on function public.delete_link_ingestion(bigint) to service_role;
