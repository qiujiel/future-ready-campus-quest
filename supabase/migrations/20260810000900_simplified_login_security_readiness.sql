alter table private.student_login_credentials owner to postgres;
alter table private.student_login_attempts owner to postgres;
alter table private.student_login_credentials enable row level security;
alter table private.student_login_attempts enable row level security;

revoke all on table private.student_login_credentials
  from public, anon, authenticated, service_role;
revoke all on table private.student_login_attempts
  from public, anon, authenticated, service_role;

alter function public.preflight_student_code_join(text, text)
  owner to postgres;
alter function public.find_completed_student_code_join(text, uuid)
  owner to postgres;
alter function public.prepare_student_code_join(text, uuid, text)
  owner to postgres;
alter function public.complete_student_code_join(
  text, uuid, uuid, text, uuid, text, text, text, integer, boolean
) owner to postgres;
alter function public.begin_student_login(uuid, text, text, uuid)
  owner to postgres;
alter function public.finish_student_login(uuid, uuid, boolean)
  owner to postgres;
alter function public.load_student_login_identity(uuid)
  owner to postgres;

revoke all on function public.preflight_student_code_join(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.find_completed_student_code_join(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_student_code_join(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_student_code_join(
  text, uuid, uuid, text, uuid, text, text, text, integer, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.begin_student_login(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_student_login(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.load_student_login_identity(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.preflight_student_code_join(text, text)
  to service_role;
grant execute on function public.find_completed_student_code_join(text, uuid)
  to service_role;
grant execute on function public.prepare_student_code_join(text, uuid, text)
  to service_role;
grant execute on function public.complete_student_code_join(
  text, uuid, uuid, text, uuid, text, text, text, integer, boolean
) to service_role;
grant execute on function public.begin_student_login(uuid, text, text, uuid)
  to service_role;
grant execute on function public.finish_student_login(uuid, uuid, boolean)
  to service_role;
grant execute on function public.load_student_login_identity(uuid)
  to service_role;

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
    'latestGateDMigration', '20260810000900',
    'requiredMigrationsPresent', (
      select count(distinct schema_migrations.version) = 26
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
        '20260810000800',
        '20260810000900'
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
        'public.preflight_student_code_join(text,text)'
      ) is not null
      and to_regprocedure(
        'public.find_completed_student_code_join(text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.prepare_student_code_join(text,uuid,text)'
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
      and exists (
        select 1
        from pg_catalog.pg_attribute as attributes
        where attributes.attrelid = 'public.cohorts'::regclass
          and attributes.attname = 'student_access_id'
          and attributes.atttypid = 'uuid'::regtype
          and attributes.attnotnull
          and not attributes.attisdropped
      )
      and exists (
        select 1
        from pg_catalog.pg_index as indexes
        join pg_catalog.pg_class as index_relations
          on index_relations.oid = indexes.indexrelid
        join pg_catalog.pg_attribute as columns
          on columns.attrelid = indexes.indrelid
          and columns.attname = 'student_access_id'
          and not columns.attisdropped
        where indexes.indrelid = 'public.cohorts'::regclass
          and index_relations.relname = 'cohorts_student_access_id_uidx'
          and indexes.indisunique
          and indexes.indisvalid
          and indexes.indisready
          and indexes.indpred is null
          and indexes.indexprs is null
          and indexes.indnatts = 1
          and indexes.indnkeyatts = 1
          and indexes.indkey::text = columns.attnum::text
      )
      and to_regprocedure(
        'public.preflight_student_code_join(text,text)'
      ) is not null
      and to_regprocedure(
        'public.find_completed_student_code_join(text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.prepare_student_code_join(text,uuid,text)'
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
    'studentLoginSecurityReady',
      (
        select count(*) = 2
          and coalesce(bool_and(
            pg_get_userbyid(relations.relowner) = 'postgres'
            and relations.relrowsecurity
          ), false)
        from pg_catalog.pg_class as relations
        where relations.oid in (
          to_regclass('private.student_login_credentials'),
          to_regclass('private.student_login_attempts')
        )
      )
      and not exists (
        select 1
        from (values
          ('anon'::text),
          ('authenticated'::text)
        ) as browser_roles(role_name)
        cross join (values
          ('SELECT'::text),
          ('INSERT'::text),
          ('UPDATE'::text),
          ('DELETE'::text),
          ('TRUNCATE'::text),
          ('REFERENCES'::text),
          ('TRIGGER'::text)
        ) as table_privileges(privilege_name)
        cross join (values
          (to_regclass('private.student_login_credentials')),
          (to_regclass('private.student_login_attempts'))
        ) as protected_tables(table_oid)
        where coalesce(has_table_privilege(
          browser_roles.role_name,
          protected_tables.table_oid,
          table_privileges.privilege_name
        ), false)
      )
      and (
        select count(*) = 7
          and coalesce(bool_and(
            functions.prosecdef
            and functions.proconfig @> array['search_path=""']
            and pg_get_userbyid(functions.proowner) = 'postgres'
            and has_function_privilege(
              'service_role',
              functions.oid,
              'EXECUTE'
            )
            and not has_function_privilege(
              'anon',
              functions.oid,
              'EXECUTE'
            )
            and not has_function_privilege(
              'authenticated',
              functions.oid,
              'EXECUTE'
            )
          ), false)
        from pg_catalog.pg_proc as functions
        where functions.oid in (
          to_regprocedure(
            'public.preflight_student_code_join(text,text)'
          ),
          to_regprocedure(
            'public.find_completed_student_code_join(text,uuid)'
          ),
          to_regprocedure(
            'public.prepare_student_code_join(text,uuid,text)'
          ),
          to_regprocedure(
            'public.complete_student_code_join(text,uuid,uuid,text,uuid,text,text,text,integer,boolean)'
          ),
          to_regprocedure(
            'public.begin_student_login(uuid,text,text,uuid)'
          ),
          to_regprocedure(
            'public.finish_student_login(uuid,uuid,boolean)'
          ),
          to_regprocedure(
            'public.load_student_login_identity(uuid)'
          )
        )
      ),
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
) from public, anon, authenticated, service_role;
grant execute on function public.get_production_readiness_report(
  text,
  uuid,
  uuid
) to service_role;

comment on function public.get_production_readiness_report(text, uuid, uuid)
  is 'Read-only production readiness for complete classroom login objects, runtime security, and migration state.';
