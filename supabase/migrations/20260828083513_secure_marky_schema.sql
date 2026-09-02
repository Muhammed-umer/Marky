-- Keep the public schema's automatic RLS event trigger internal.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- This internal operational table is intentionally not available through the Data API.
create policy ingestion_runs_no_access on public.ingestion_runs
  for all to authenticated
  using (false)
  with check (false);

-- Avoid repeated per-row JWT evaluation in RLS policies.
drop policy profiles_select_own on public.profiles;
drop policy profiles_insert_own on public.profiles;
drop policy profiles_update_own on public.profiles;
drop policy user_interests_own on public.user_interests;
drop policy saved_items_own on public.saved_items;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (clerk_user_id = ((select auth.jwt()) ->> 'sub'));
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (clerk_user_id = ((select auth.jwt()) ->> 'sub'));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (clerk_user_id = ((select auth.jwt()) ->> 'sub'))
  with check (clerk_user_id = ((select auth.jwt()) ->> 'sub'));
create policy user_interests_own on public.user_interests
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = user_id and p.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = user_id and p.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  ));
create policy saved_items_own on public.saved_items
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = user_id and p.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = user_id and p.clerk_user_id = ((select auth.jwt()) ->> 'sub')
  ));

-- Cover foreign-key lookups that are not already covered by composite keys.
create index content_item_interests_interest_idx on public.content_item_interests(interest_id);
create index content_item_sources_source_idx on public.content_item_sources(source_id);
create index ingestion_runs_source_idx on public.ingestion_runs(source_id);
create index saved_items_content_item_idx on public.saved_items(content_item_id);
create index user_interests_interest_idx on public.user_interests(interest_id);
