create extension if not exists pg_cron with schema extensions;

create or replace function public.run_expired_artifact_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovery integer;
  v_attempts integer;
  v_windows integer;
begin
  if coalesce(auth.role()::text, '') <> 'service_role'
    and session_user <> 'postgres'
  then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;

  delete from private.session_recovery_tokens
  where expires_at < now() - interval '1 day';
  get diagnostics v_recovery = row_count;

  delete from private.join_attempts
  where attempted_at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;

  update public.cohort_join_windows
  set closed_at = coalesce(closed_at, expires_at)
  where expires_at < now()
    and closed_at is null;
  get diagnostics v_windows = row_count;

  return jsonb_build_object(
    'recoveryTokensRemoved', v_recovery,
    'rateLimitEventsRemoved', v_attempts,
    'joinWindowsClosed', v_windows
  );
end;
$$;

revoke all on function public.run_expired_artifact_cleanup() from public;
grant execute on function public.run_expired_artifact_cleanup()
  to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'campus-quest-expired-artifact-cleanup';

select cron.schedule(
  'campus-quest-expired-artifact-cleanup',
  '17 3 * * *',
  'select public.run_expired_artifact_cleanup();'
);

comment on function public.run_expired_artifact_cleanup() is
  'Daily service-role or postgres cleanup of expired admission artifacts.';
