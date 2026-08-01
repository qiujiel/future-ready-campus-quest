begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron with schema extensions;

select plan(5);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'latestGateDMigration',
  '20260730021000',
  'readiness records the complete deployment-readiness migration set'
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

select cron.unschedule(jobid)
from cron.job
where jobname = 'campus-quest-expired-artifact-cleanup';

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
