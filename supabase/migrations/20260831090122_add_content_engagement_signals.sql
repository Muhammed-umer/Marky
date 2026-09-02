alter table public.content_items
  add column engagement_count integer not null default 0 check (engagement_count >= 0),
  add column engagement_checked_at timestamptz;

create index content_items_popular_recent_idx
  on public.content_items (engagement_count desc, published_at desc)
  where published_at is not null;
