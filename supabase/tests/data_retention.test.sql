begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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

select * from finish();
rollback;
