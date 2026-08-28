create extension if not exists pgcrypto;

create type public.source_type as enum ('medium_rss', 'manual_web', 'x');
create type public.publication_time_status as enum ('known', 'unknown');
create type public.ingestion_status as enum ('running', 'succeeded', 'partial', 'failed');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text,
  display_name text,
  avatar_url text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text not null default ''
);

create table public.user_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type public.source_type not null,
  feed_url text,
  site_url text not null,
  is_active boolean not null default true,
  fetch_interval_minutes integer not null default 45 check (fetch_interval_minutes between 30 and 60),
  etag text,
  last_modified text,
  last_successful_fetch timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  primary_source_id uuid references public.sources(id) on delete set null,
  external_id text,
  canonical_url text not null,
  url_hash text not null unique,
  title text not null,
  author text,
  summary text,
  sanitized_body text,
  published_at timestamptz,
  publication_time_status public.publication_time_status not null default 'unknown',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index content_source_external_unique on public.content_items(primary_source_id, external_id) where external_id is not null;
create index content_items_published_at_idx on public.content_items(published_at desc);
create index content_items_fetched_at_idx on public.content_items(fetched_at desc);
create index content_items_source_idx on public.content_items(primary_source_id);

create table public.content_item_interests (
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  primary key (content_item_id, interest_id)
);

create table public.content_item_sources (
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (content_item_id, source_id)
);

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  is_read boolean not null default false,
  note text check (char_length(note) <= 2000),
  saved_at timestamptz not null default now(),
  unique (user_id, content_item_id)
);
create index saved_items_user_idx on public.saved_items(user_id, saved_at desc);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  status public.ingestion_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  error_code text
);
create index ingestion_runs_started_idx on public.ingestion_runs(started_at desc);

insert into public.interests (name, slug, description) values
  ('Artificial Intelligence', 'artificial-intelligence', 'Models, agents, evaluation, and applied AI'),
  ('Programming', 'programming', 'Languages, patterns, and practical coding'),
  ('Software Engineering', 'software-engineering', 'Architecture, quality, and engineering practice'),
  ('Cybersecurity', 'cybersecurity', 'Application, cloud, and infrastructure security'),
  ('Startups', 'startups', 'Technology companies, products, and markets'),
  ('Cloud Computing', 'cloud-computing', 'Cloud platforms and distributed infrastructure'),
  ('Data Science', 'data-science', 'Analytics, statistics, and data systems'),
  ('Developer Tools', 'developer-tools', 'Tools that improve software development');

insert into public.sources (name, source_type, feed_url, site_url) values
  ('Medium · Artificial Intelligence', 'medium_rss', 'https://medium.com/feed/tag/artificial-intelligence', 'https://medium.com/tag/artificial-intelligence'),
  ('Medium · Programming', 'medium_rss', 'https://medium.com/feed/tag/programming', 'https://medium.com/tag/programming'),
  ('Medium · Software Engineering', 'medium_rss', 'https://medium.com/feed/tag/software-engineering', 'https://medium.com/tag/software-engineering'),
  ('Medium · Cybersecurity', 'medium_rss', 'https://medium.com/feed/tag/cybersecurity', 'https://medium.com/tag/cybersecurity'),
  ('Medium · Startups', 'medium_rss', 'https://medium.com/feed/tag/startups', 'https://medium.com/tag/startups'),
  ('Medium · Cloud Computing', 'medium_rss', 'https://medium.com/feed/tag/cloud-computing', 'https://medium.com/tag/cloud-computing'),
  ('Medium · Data Science', 'medium_rss', 'https://medium.com/feed/tag/data-science', 'https://medium.com/tag/data-science'),
  ('Medium · Developer Tools', 'medium_rss', 'https://medium.com/feed/tag/developer-tools', 'https://medium.com/tag/developer-tools');

alter table public.profiles enable row level security;
alter table public.interests enable row level security;
alter table public.user_interests enable row level security;
alter table public.sources enable row level security;
alter table public.content_items enable row level security;
alter table public.content_item_interests enable row level security;
alter table public.content_item_sources enable row level security;
alter table public.saved_items enable row level security;
alter table public.ingestion_runs enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (clerk_user_id = (select auth.jwt()->>'sub'));
create policy profiles_insert_own on public.profiles for insert to authenticated with check (clerk_user_id = (select auth.jwt()->>'sub'));
create policy profiles_update_own on public.profiles for update to authenticated using (clerk_user_id = (select auth.jwt()->>'sub')) with check (clerk_user_id = (select auth.jwt()->>'sub'));
create policy interests_read on public.interests for select to authenticated using (true);
create policy sources_read on public.sources for select to authenticated using (true);
create policy content_read on public.content_items for select to authenticated using (true);
create policy content_interests_read on public.content_item_interests for select to authenticated using (true);
create policy content_sources_read on public.content_item_sources for select to authenticated using (true);
create policy user_interests_own on public.user_interests for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = user_id and p.clerk_user_id = (select auth.jwt()->>'sub')))
  with check (exists (select 1 from public.profiles p where p.id = user_id and p.clerk_user_id = (select auth.jwt()->>'sub')));
create policy saved_items_own on public.saved_items for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = user_id and p.clerk_user_id = (select auth.jwt()->>'sub')))
  with check (exists (select 1 from public.profiles p where p.id = user_id and p.clerk_user_id = (select auth.jwt()->>'sub')));

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.interests, public.sources, public.content_items, public.content_item_interests, public.content_item_sources to authenticated;
grant select, insert, update, delete on public.user_interests, public.saved_items to authenticated;
revoke all on public.ingestion_runs from anon, authenticated;
