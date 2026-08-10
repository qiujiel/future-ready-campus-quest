do $$
declare
  v_grantee oid;
  v_role_name text;
begin
  for v_grantee in
    select distinct privileges.grantee
    from pg_catalog.pg_class as relations
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relations.relacl,
        pg_catalog.acldefault('r', relations.relowner)
      )
    ) as privileges
    where relations.oid in (
      'private.student_login_credentials'::regclass,
      'private.student_login_attempts'::regclass
    )
      and privileges.grantee <> relations.relowner
  loop
    if v_grantee = 0 then
      execute 'revoke all privileges on table '
        || 'private.student_login_credentials, '
        || 'private.student_login_attempts from public cascade';
    else
      v_role_name := pg_catalog.pg_get_userbyid(v_grantee);
      execute format(
        'revoke all privileges on table private.student_login_credentials, '
          || 'private.student_login_attempts from %I cascade',
        v_role_name
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  v_grantee oid;
  v_role_name text;
begin
  for v_grantee in
    select distinct privileges.grantee
    from pg_catalog.pg_proc as functions
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        functions.proacl,
        pg_catalog.acldefault('f', functions.proowner)
      )
    ) as privileges
    where functions.oid in (
      'public.preflight_student_code_join(text,text)'::regprocedure,
      'public.find_completed_student_code_join(text,uuid)'::regprocedure,
      'public.prepare_student_code_join(text,uuid,text)'::regprocedure,
      'public.complete_student_code_join(text,uuid,uuid,text,uuid,text,text,text,integer,boolean)'::regprocedure,
      'public.begin_student_login(uuid,text,text,uuid)'::regprocedure,
      'public.finish_student_login(uuid,uuid,boolean)'::regprocedure,
      'public.load_student_login_identity(uuid)'::regprocedure
    )
      and privileges.grantee <> functions.proowner
  loop
    if v_grantee = 0 then
      execute 'revoke all privileges on function '
        || 'public.preflight_student_code_join(text,text), '
        || 'public.find_completed_student_code_join(text,uuid), '
        || 'public.prepare_student_code_join(text,uuid,text), '
        || 'public.complete_student_code_join(text,uuid,uuid,text,uuid,text,text,text,integer,boolean), '
        || 'public.begin_student_login(uuid,text,text,uuid), '
        || 'public.finish_student_login(uuid,uuid,boolean), '
        || 'public.load_student_login_identity(uuid) from public cascade';
    else
      v_role_name := pg_catalog.pg_get_userbyid(v_grantee);
      execute format(
        'revoke all privileges on function '
          || 'public.preflight_student_code_join(text,text), '
          || 'public.find_completed_student_code_join(text,uuid), '
          || 'public.prepare_student_code_join(text,uuid,text), '
          || 'public.complete_student_code_join(text,uuid,uuid,text,uuid,text,text,text,integer,boolean), '
          || 'public.begin_student_login(uuid,text,text,uuid), '
          || 'public.finish_student_login(uuid,uuid,boolean), '
          || 'public.load_student_login_identity(uuid) from %I cascade',
        v_role_name
      );
    end if;
  end loop;
end;
$$;

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
      select count(*) = 14
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
  rename to get_production_readiness_report_009;
revoke all on function private.get_production_readiness_report_009(
  text,
  uuid,
  uuid
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
    select private.get_production_readiness_report_009(
      p_content_version_key,
      p_smoke_teacher_id,
      p_smoke_cohort_id
    ) as report
  )
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        prior.report,
        '{latestGateDMigration}',
        to_jsonb('20260810001000'::text)
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
          where schema_migrations.version = '20260810001000'
        )
      )
    ),
    '{studentLoginSecurityReady}',
    to_jsonb(
      coalesce(
        (prior.report->>'studentLoginSecurityReady')::boolean,
        false
      )
      and private.student_login_acl_allowlists_ready()
    )
  )
  from prior
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
  is 'Read-only production readiness with exact owner-only table and owner-plus-service RPC ACL allowlists.';
