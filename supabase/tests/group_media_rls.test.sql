begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select is(
  (
    select public
    from storage.buckets
    where id = 'group-images'
  ),
  false,
  'the group-images bucket is private'
);

select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'group-images'
  ),
  5242880::bigint,
  'the raw upload limit is 5 MB'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'group_images_%'
      and roles @> array['anon']::name[]
  $$,
  array[0::bigint],
  'anonymous users receive no group-image object policy'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'group_images_%'
      and cmd = 'SELECT'
      and roles @> array['authenticated']::name[]
  $$,
  array[0::bigint],
  'authenticated browsers receive no direct object read policy'
);

set local role anon;
select throws_ok(
  $$select * from public.authorize_group_media_read(
    '60000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'MEDIA_ACTION_DENIED',
  'anonymous callers cannot authorize signed image reads'
);

select * from finish();
rollback;
