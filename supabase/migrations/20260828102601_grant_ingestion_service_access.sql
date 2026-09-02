grant usage on schema public to service_role;
grant select, insert, update on public.profiles to service_role;
grant select on public.interests to service_role;
grant select, insert, update on public.sources to service_role;
grant select, insert, update on public.content_items to service_role;
grant select, insert, update on public.content_item_interests to service_role;
grant select, insert, update on public.content_item_sources to service_role;
grant select, insert, update, delete on public.saved_items to service_role;
grant select, insert, update on public.ingestion_runs to service_role;
