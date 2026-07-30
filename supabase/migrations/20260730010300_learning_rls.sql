revoke all on schema content from public, anon, authenticated;
revoke all on all tables in schema content from public, anon, authenticated;
revoke all on all sequences in schema content from public, anon, authenticated;

alter default privileges in schema content
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema content
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema content
  revoke all on functions from public, anon, authenticated;

alter table content.content_versions enable row level security;
alter table content.concepts enable row level security;
alter table content.learning_items enable row level security;
alter table content.item_options enable row level security;
alter table content.item_source_refs enable row level security;

revoke all on function public.import_learning_content(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_learning_content(jsonb)
  to service_role;
