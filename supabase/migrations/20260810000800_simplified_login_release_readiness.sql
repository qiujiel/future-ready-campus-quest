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
    'latestGateDMigration', '20260810000800',
    'requiredMigrationsPresent', (
      select count(distinct schema_migrations.version) = 25
      from supabase_migrations.schema_migrations
      where schema_migrations.version in (
        '20260730020500',
        '20260730020600',
        '20260730020700',
        '20260730020800',
        '20260730020900',
        '20260730021000',
        '20260730021100',
        '20260806000100',
        '20260806000200',
        '20260806000300',
        '20260806000400',
        '20260806000500',
        '20260806000600',
        '20260806000700',
        '20260808000100',
        '20260808000200',
        '20260808000300',
        '20260810000100',
        '20260810000200',
        '20260810000300',
        '20260810000400',
        '20260810000500',
        '20260810000600',
        '20260810000700',
        '20260810000800'
      )
    ),
    'requiredFunctionsPresent',
      to_regprocedure(
        'public.get_teacher_dashboard_summary(uuid)'
      ) is not null
      and to_regprocedure(
        'public.apply_teacher_control(uuid,text,text,integer,boolean,uuid)'
      ) is not null
      and to_regprocedure(
        'public.purge_archived_cohort(uuid,text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.assert_teacher_control_scope(uuid,uuid,uuid)'
      ) is not null
      and to_regprocedure(
        'public.run_expired_artifact_cleanup()'
      ) is not null
      and to_regprocedure(
        'public.close_teacher_session(uuid,uuid)'
      ) is not null
      and to_regprocedure(
        'public.configure_cohort_group_join_codes(uuid,uuid,jsonb)'
      ) is not null
      and to_regprocedure(
        'public.get_teacher_classroom_readiness(uuid)'
      ) is not null
      and to_regprocedure(
        'public.manage_teacher_roster(uuid,text,uuid,uuid,uuid)'
      ) is not null
      and to_regprocedure(
        'public.launch_cohort_quest(uuid,uuid)'
      ) is not null
      and to_regprocedure(
        'public.ensure_student_quest_attempt()'
      ) is not null
      and to_regprocedure(
        'public.get_teacher_question_bank(uuid)'
      ) is not null
      and to_regprocedure(
        'public.complete_student_code_join(text,uuid,uuid,text,uuid,text,text,text,integer,boolean)'
      ) is not null
      and to_regprocedure(
        'public.begin_student_login(uuid,text,text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.finish_student_login(uuid,uuid,boolean)'
      ) is not null
      and to_regprocedure(
        'public.load_student_login_identity(uuid)'
      ) is not null,
    'studentLoginObjectsPresent',
      to_regclass('private.student_login_credentials') is not null
      and to_regclass('private.student_login_attempts') is not null
      and to_regprocedure(
        'public.complete_student_code_join(text,uuid,uuid,text,uuid,text,text,text,integer,boolean)'
      ) is not null
      and to_regprocedure(
        'public.begin_student_login(uuid,text,text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.finish_student_login(uuid,uuid,boolean)'
      ) is not null
      and to_regprocedure(
        'public.load_student_login_identity(uuid)'
      ) is not null,
    'cleanupScheduleReady', (
      select count(*) = 1
        and coalesce(bool_and(
          schedule = '17 3 * * *'
          and command = 'select public.run_expired_artifact_cleanup();'
          and database = current_database()
          and username = 'postgres'
          and active
        ), false)
      from cron.job
      where jobname = 'campus-quest-expired-artifact-cleanup'
    ),
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

alter function public.get_production_readiness_report(text, uuid, uuid)
  owner to postgres;

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
  is 'Read-only production readiness for the complete simplified-login migration chain and private login RPCs.';
