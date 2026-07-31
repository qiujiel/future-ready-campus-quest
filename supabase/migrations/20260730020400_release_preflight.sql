create or replace function public.get_production_readiness_report(
  p_content_version_key text,
  p_smoke_teacher_id uuid,
  p_smoke_cohort_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'migrationMarker', '20260730020400',
    'requiredFunctionsPresent',
      to_regprocedure(
        'public.get_teacher_dashboard_summary(uuid)'
      ) is not null
      and to_regprocedure(
        'public.apply_teacher_control(uuid,text,text,integer,boolean,uuid)'
      ) is not null
      and to_regprocedure(
        'public.purge_archived_cohort(uuid,text,uuid)'
      ) is not null,
    'openJoinWindows', (
      select count(*)
      from public.cohort_join_windows
      where closed_at is null
        and expires_at > now()
    ),
    'openRecoveryTokens', (
      select count(*)
      from private.session_recovery_tokens
      where invalidated_at is null
        and redeemed_at is null
        and expires_at > now()
    ),
    'contentVersion', (
      select jsonb_build_object(
        'versionKey', content_versions.version_key,
        'itemCount', content_versions.item_count,
        'conceptCount', content_versions.concept_count
      )
      from content.content_versions
      where content_versions.version_key = p_content_version_key
    ),
    'smokeFixtureReady', exists (
      select 1
      from public.cohorts
      join public.user_roles
        on user_roles.user_id = cohorts.teacher_id
      where cohorts.id = p_smoke_cohort_id
        and cohorts.teacher_id = p_smoke_teacher_id
        and user_roles.role = 'teacher'
        and cohorts.archived_at is null
    ),
    'retentionDays', (
      select cohort_retention_days
      from private.data_retention_configuration
      where singleton
    )
  )
$$;

revoke all on function public.get_production_readiness_report(
  text,
  uuid,
  uuid
) from public;
grant execute on function public.get_production_readiness_report(
  text,
  uuid,
  uuid
) to service_role;

comment on function public.get_production_readiness_report(text, uuid, uuid)
  is 'Read-only production preflight without names, answers, tokens, or reflections.';
