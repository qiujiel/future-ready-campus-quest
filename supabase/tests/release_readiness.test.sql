begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron with schema extensions;

select plan(16);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'latestGateDMigration',
  '20260810000800',
  'readiness records the complete simplified-login deployment migration set'
);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'requiredMigrationsPresent',
  'true',
  'readiness requires the complete simplified-login migration chain'
);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginObjectsPresent',
  'true',
  'readiness requires the student-login RPCs and private credential objects'
);

select ok(
  (
    select functions.prosecdef
      and functions.proconfig @> array['search_path=""']
      and pg_get_userbyid(functions.proowner) = 'postgres'
    from pg_proc as functions
    where functions.oid =
      'public.get_production_readiness_report(text,uuid,uuid)'::regprocedure
  ),
  'the readiness report remains a postgres-owned definer with an empty search path'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_production_readiness_report(text,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the readiness report'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_production_readiness_report(text,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated callers cannot execute the readiness report'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_production_readiness_report(text,uuid,uuid)',
    'EXECUTE'
  ),
  'only the service boundary retains readiness-report execution'
);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'cleanupScheduleReady',
  'true',
  'readiness requires the exact active cleanup schedule'
);

select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'campus-quest-expired-artifact-cleanup'
  ),
  1,
  'expired artifact cleanup has exactly one daily schedule'
);

create role readiness_duplicate_owner login;
grant usage on schema cron to readiness_duplicate_owner;
grant execute on function cron.schedule_in_database(
  text,
  text,
  text,
  text,
  text,
  boolean
) to readiness_duplicate_owner;
grant readiness_duplicate_owner to postgres;
set role readiness_duplicate_owner;

select cron.schedule_in_database(
  'campus-quest-expired-artifact-cleanup',
  '18 3 * * *',
  'select 1;',
  current_database(),
  null,
  false
);

reset role;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'cleanupScheduleReady',
  'false',
  'readiness fails when a same-name schedule exists under another owner'
);

select cron.unschedule('campus-quest-expired-artifact-cleanup');
set role readiness_duplicate_owner;
select cron.unschedule('campus-quest-expired-artifact-cleanup');
reset role;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'cleanupScheduleReady',
  'false',
  'readiness fails when the cleanup schedule is absent'
);

savepoint missing_simplified_login_migration;

delete from supabase_migrations.schema_migrations
where version = '20260810000700';

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'requiredMigrationsPresent',
  'false',
  'readiness rejects a database missing one simplified-login migration'
);

rollback to savepoint missing_simplified_login_migration;

savepoint missing_classroom_concurrency_migration;

delete from supabase_migrations.schema_migrations
where version = '20260808000300';

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'requiredMigrationsPresent',
  'false',
  'readiness rejects a database missing a classroom concurrency migration'
);

rollback to savepoint missing_classroom_concurrency_migration;

drop function public.begin_student_login(uuid, text, text, uuid);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'requiredFunctionsPresent',
  'false',
  'readiness rejects a database missing a required returning-login RPC'
);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginObjectsPresent',
  'false',
  'readiness rejects a database missing a returning student-login RPC'
);

drop function public.close_teacher_session(uuid, uuid);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'requiredFunctionsPresent',
  'false',
  'readiness requires the atomic session-close RPC'
);

select * from finish();
rollback;
