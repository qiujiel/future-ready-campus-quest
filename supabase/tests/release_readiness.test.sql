begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron with schema extensions;

select plan(6);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'latestGateDMigration',
  '20260806000700',
  'readiness records the complete student-ready deployment migration set'
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
