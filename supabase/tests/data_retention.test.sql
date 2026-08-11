begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_column(
  'public',
  'cohorts',
  'archived_at',
  'cohorts have an explicit archival state'
);

select has_function(
  'public',
  'archive_teacher_cohort',
  array['uuid', 'uuid'],
  'teachers can explicitly archive an owned cohort'
);

select has_function(
  'public',
  'purge_archived_cohort',
  array['uuid', 'text', 'uuid'],
  'archived cohort data has an explicit teacher-requested purge'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.purge_archived_cohort(uuid,text,uuid)',
    'execute'
  ),
  'anonymous callers cannot purge cohort data'
);

select is(
  (
    select cohort_retention_days
    from private.data_retention_configuration
    where singleton
  ),
  null::integer,
  'the production retention period remains unconfigured pending owner approval'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.run_expired_artifact_cleanup()',
    'execute'
  ),
  'browser clients cannot run scheduled cleanup'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.run_expired_artifact_cleanup()',
    'execute'
  ),
  'scheduled cleanup is restricted to the service role'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'e1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'retention-teacher@example.invalid',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

insert into public.user_roles (user_id, role)
values ('e1000000-0000-0000-0000-000000000001', 'teacher');

insert into public.cohorts (
  id,
  teacher_id,
  title,
  group_count,
  group_capacity,
  archived_at
)
values (
  'e3000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'Archived retention fixture',
  1,
  4,
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.purge_archived_cohort(
      'e3000000-0000-0000-0000-000000000001',
      'PURGE e3000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001'
    )$$,
  'an archived class can be anonymized through the browser-safe purge path'
);

select * from finish();
rollback;
