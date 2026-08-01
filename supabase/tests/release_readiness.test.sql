begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron with schema extensions;

select plan(3);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'latestGateDMigration',
  '20260730020700',
  'readiness records the last required Gate D migration'
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
