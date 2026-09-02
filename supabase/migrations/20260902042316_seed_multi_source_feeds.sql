create unique index if not exists sources_feed_url_unique
  on public.sources (feed_url)
  where feed_url is not null;

insert into public.sources (name, source_type, feed_url, site_url, fetch_interval_minutes, is_active)
values
  ('GitHub Blog', 'rss', 'https://github.blog/feed/', 'https://github.blog/', 30, true),
  ('Cloudflare Blog', 'rss', 'https://blog.cloudflare.com/rss/', 'https://blog.cloudflare.com/', 30, true),
  ('Vercel Changelog', 'rss', 'https://vercel.com/atom', 'https://vercel.com/changelog', 30, true)
on conflict (feed_url) where feed_url is not null do nothing;
