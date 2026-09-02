create type public.content_event_type as enum (
  'impression', 'open', 'save', 'unsave', 'mark_read', 'mark_unread', 'complete', 'dismiss'
);

create table public.content_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  event_type public.content_event_type not null,
  dwell_seconds integer check (dwell_seconds between 0 and 86400),
  completion_ratio numeric(4,3) check (completion_ratio between 0 and 1),
  occurred_at timestamptz not null default now()
);

create index content_events_user_recent_idx on public.content_events(user_id, occurred_at desc);
create index content_events_item_type_idx on public.content_events(content_item_id, event_type, occurred_at desc);

create table public.user_interest_affinities (
  user_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  score numeric(7,3) not null default 0 check (score between -5 and 20),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);

create index user_interest_affinities_rank_idx on public.user_interest_affinities(user_id, score desc);

alter table public.content_events enable row level security;
alter table public.user_interest_affinities enable row level security;

revoke all on public.content_events from anon, authenticated;
revoke all on public.user_interest_affinities from anon, authenticated;
grant select, insert on public.content_events to service_role;
grant select, insert, update on public.user_interest_affinities to service_role;

create or replace function public.record_content_event(
  p_client_event_id uuid,
  p_user_id uuid,
  p_content_item_id uuid,
  p_event_type public.content_event_type,
  p_dwell_seconds integer default null,
  p_completion_ratio numeric default null
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_rows integer;
  signal_weight numeric;
begin
  insert into public.content_events (
    client_event_id, user_id, content_item_id, event_type, dwell_seconds, completion_ratio
  ) values (
    p_client_event_id, p_user_id, p_content_item_id, p_event_type,
    least(greatest(p_dwell_seconds, 0), 86400),
    least(greatest(p_completion_ratio, 0), 1)
  ) on conflict (client_event_id) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then return false; end if;

  signal_weight := case p_event_type
    when 'impression' then 0.02
    when 'open' then 0.40
    when 'save' then 1.20
    when 'unsave' then -0.60
    when 'mark_read' then 0.80
    when 'mark_unread' then -0.20
    when 'complete' then 1.50
    when 'dismiss' then -1.20
  end;

  insert into public.user_interest_affinities (user_id, interest_id, score, evidence_count, updated_at)
  select p_user_id, cii.interest_id, signal_weight, 1, now()
  from public.content_item_interests cii
  where cii.content_item_id = p_content_item_id
  on conflict (user_id, interest_id) do update
  set score = least(20, greatest(-5, public.user_interest_affinities.score + excluded.score)),
      evidence_count = public.user_interest_affinities.evidence_count + 1,
      updated_at = now();

  return true;
end;
$$;

revoke execute on function public.record_content_event(uuid, uuid, uuid, public.content_event_type, integer, numeric) from public, anon, authenticated;
grant execute on function public.record_content_event(uuid, uuid, uuid, public.content_event_type, integer, numeric) to service_role;
