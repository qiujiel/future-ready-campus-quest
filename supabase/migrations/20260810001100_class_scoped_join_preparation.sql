create function public.prepare_student_class_code_join(
  p_code_hash text,
  p_request_key uuid,
  p_rate_key_hash text,
  p_student_access_id uuid
)
returns table (
  completed boolean,
  student_id uuid,
  cohort_id uuid,
  group_id uuid,
  group_number smallint,
  nickname text,
  is_group_identity_editor boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    prepared.completed,
    prepared.student_id,
    prepared.cohort_id,
    prepared.group_id,
    prepared.group_number,
    prepared.nickname,
    prepared.is_group_identity_editor
  from public.prepare_student_code_join(
    p_code_hash,
    p_request_key,
    p_rate_key_hash
  ) as prepared
  join public.cohorts as cohorts
    on cohorts.id = prepared.cohort_id
   and cohorts.student_access_id = p_student_access_id
$$;

alter function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) owner to postgres;
revoke all on function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) to service_role;

comment on function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) is
  'Combines replay, rate/capacity preflight, and class-access validation in one trusted round trip; wrong-class requests return no row while retaining the protected rate attempt.';

create or replace function private.student_login_acl_allowlists_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      select count(*) = 16
        and coalesce(bool_and(
          privileges.grantee = relations.relowner
          and privileges.grantor = relations.relowner
          and not privileges.is_grantable
          and privileges.privilege_type in (
            'INSERT',
            'SELECT',
            'UPDATE',
            'DELETE',
            'TRUNCATE',
            'REFERENCES',
            'TRIGGER',
            'MAINTAIN'
          )
        ), false)
      from pg_catalog.pg_class as relations
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relations.relacl,
          pg_catalog.acldefault('r', relations.relowner)
        )
      ) as privileges
      where relations.oid in (
        to_regclass('private.student_login_credentials'),
        to_regclass('private.student_login_attempts')
      )
    )
    and (
      select count(*) = 16
        and coalesce(bool_and(
          privileges.privilege_type = 'EXECUTE'
          and privileges.grantor = functions.proowner
          and not privileges.is_grantable
          and privileges.grantee in (
            functions.proowner,
            to_regrole('service_role')
          )
        ), false)
      from pg_catalog.pg_proc as functions
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          functions.proacl,
          pg_catalog.acldefault('f', functions.proowner)
        )
      ) as privileges
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
          'public.prepare_student_class_code_join(text,uuid,text,uuid)'
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
    );
$$;

alter function private.student_login_acl_allowlists_ready()
  owner to postgres;
revoke all on function private.student_login_acl_allowlists_ready()
  from public, anon, authenticated, service_role;

alter function public.get_production_readiness_report(text, uuid, uuid)
  set schema private;
alter function private.get_production_readiness_report(text, uuid, uuid)
  rename to get_production_readiness_report_010;
revoke all on function private.get_production_readiness_report_010(
  text, uuid, uuid
) from public, anon, authenticated, service_role;

create function public.get_production_readiness_report(
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
  with prior as (
    select private.get_production_readiness_report_010(
      p_content_version_key,
      p_smoke_teacher_id,
      p_smoke_cohort_id
    ) as report
  )
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            prior.report,
            '{latestGateDMigration}',
            to_jsonb('20260810001100'::text)
          ),
          '{requiredMigrationsPresent}',
          to_jsonb(
            coalesce(
              (prior.report->>'requiredMigrationsPresent')::boolean,
              false
            )
            and exists (
              select 1
              from supabase_migrations.schema_migrations
              where schema_migrations.version = '20260810001100'
            )
          )
        ),
        '{requiredFunctionsPresent}',
        to_jsonb(
          coalesce(
            (prior.report->>'requiredFunctionsPresent')::boolean,
            false
          )
          and to_regprocedure(
            'public.prepare_student_class_code_join(text,uuid,text,uuid)'
          ) is not null
        )
      ),
      '{studentLoginObjectsPresent}',
      to_jsonb(
        coalesce(
          (prior.report->>'studentLoginObjectsPresent')::boolean,
          false
        )
        and to_regprocedure(
          'public.prepare_student_class_code_join(text,uuid,text,uuid)'
        ) is not null
      )
    ),
    '{studentLoginSecurityReady}',
    to_jsonb(
      coalesce(
        (prior.report->>'studentLoginSecurityReady')::boolean,
        false
      )
      and private.student_login_acl_allowlists_ready()
      and exists (
        select 1
        from pg_catalog.pg_proc as functions
        where functions.oid = to_regprocedure(
          'public.prepare_student_class_code_join(text,uuid,text,uuid)'
        )
          and functions.prosecdef
          and functions.proconfig @> array['search_path=""']
          and pg_catalog.pg_get_userbyid(functions.proowner) = 'postgres'
      )
    )
  )
  from prior
$$;

alter function public.get_production_readiness_report(text, uuid, uuid)
  owner to postgres;
revoke all on function public.get_production_readiness_report(
  text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_production_readiness_report(
  text, uuid, uuid
) to service_role;

comment on function public.get_production_readiness_report(text, uuid, uuid)
  is 'Read-only production readiness including class-scoped join preparation and exact owner/service ACL allowlists.';
