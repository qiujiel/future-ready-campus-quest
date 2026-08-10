begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron with schema extensions;

select plan(41);

create role readiness_security_owner;
grant usage, create on schema private to readiness_security_owner;
grant usage, create on schema public to readiness_security_owner;
grant readiness_security_owner to postgres;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'latestGateDMigration',
  '20260810001100',
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

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'true',
  'readiness verifies private-table and join/login RPC runtime security'
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

savepoint missing_prepare_rpc;

drop function public.prepare_student_code_join(text, uuid, text);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'requiredFunctionsPresent',
  'false',
  'readiness rejects a database missing the combined join-prepare RPC'
);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginObjectsPresent',
  'false',
  'student-login object readiness requires the combined join-prepare RPC'
);

rollback to savepoint missing_prepare_rpc;

savepoint missing_class_prepare_rpc;

drop function public.prepare_student_class_code_join(text, uuid, text, uuid);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'requiredFunctionsPresent',
  'false',
  'readiness rejects a database missing the class-scoped join-prepare RPC'
);

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginObjectsPresent',
  'false',
  'student-login object readiness requires the class-scoped join-prepare RPC'
);

rollback to savepoint missing_class_prepare_rpc;

savepoint missing_login_table;

drop table private.student_login_attempts cascade;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginObjectsPresent',
  'false',
  'student-login object readiness rejects a missing private runtime table'
);

rollback to savepoint missing_login_table;

savepoint missing_student_access_column;

alter table public.cohorts drop column student_access_id cascade;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginObjectsPresent',
  'false',
  'student-login object readiness requires the non-null UUID class access column'
);

rollback to savepoint missing_student_access_column;

savepoint missing_student_access_index;

drop index public.cohorts_student_access_id_uidx;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginObjectsPresent',
  'false',
  'student-login object readiness requires the valid unique class access index'
);

rollback to savepoint missing_student_access_index;

savepoint login_table_rls_drift;

alter table private.student_login_credentials disable row level security;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects disabled private-table RLS'
);

rollback to savepoint login_table_rls_drift;

savepoint login_table_owner_drift;

alter table private.student_login_credentials owner to readiness_security_owner;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects private-table owner drift'
);

rollback to savepoint login_table_owner_drift;

savepoint login_table_acl_drift;

grant select on private.student_login_attempts to authenticated;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects browser table grants'
);

rollback to savepoint login_table_acl_drift;

savepoint login_table_anon_acl_drift;

grant insert on private.student_login_credentials to anon;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects anonymous table grants'
);

rollback to savepoint login_table_anon_acl_drift;

savepoint login_table_custom_acl_drift;

grant select on private.student_login_credentials
  to readiness_security_owner;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects custom-role table grants'
);

rollback to savepoint login_table_custom_acl_drift;

savepoint login_table_service_acl_drift;

grant select on private.student_login_attempts to service_role;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects service-role table grants'
);

rollback to savepoint login_table_service_acl_drift;

savepoint login_rpc_invoker_drift;

alter function public.begin_student_login(uuid, text, text, uuid)
  security invoker;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects invoker-rights RPC drift'
);

rollback to savepoint login_rpc_invoker_drift;

savepoint login_rpc_search_path_drift;

alter function public.begin_student_login(uuid, text, text, uuid)
  set search_path to public;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects RPC search-path drift'
);

rollback to savepoint login_rpc_search_path_drift;

savepoint login_rpc_owner_drift;

alter function public.begin_student_login(uuid, text, text, uuid)
  owner to readiness_security_owner;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects RPC owner drift'
);

rollback to savepoint login_rpc_owner_drift;

savepoint login_rpc_acl_drift;

grant execute on function public.begin_student_login(uuid, text, text, uuid)
  to anon;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects browser RPC grants'
);

rollback to savepoint login_rpc_acl_drift;

savepoint class_prepare_rpc_acl_drift;

grant execute on function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) to anon;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects browser access to class-scoped join preparation'
);

rollback to savepoint class_prepare_rpc_acl_drift;

savepoint class_prepare_rpc_invoker_drift;

alter function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) security invoker;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects invoker-rights class-scoped join preparation'
);

rollback to savepoint class_prepare_rpc_invoker_drift;

savepoint class_prepare_rpc_search_path_drift;

alter function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) set search_path to public;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects a nonempty class-prepare search path'
);

rollback to savepoint class_prepare_rpc_search_path_drift;

savepoint class_prepare_rpc_owner_drift;

alter function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) owner to readiness_security_owner;
set role readiness_security_owner;
grant execute on function public.prepare_student_class_code_join(
  text, uuid, text, uuid
) to service_role;
reset role;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects non-postgres class-prepare ownership even with an exact owner/service ACL'
);

rollback to savepoint class_prepare_rpc_owner_drift;

savepoint login_rpc_service_acl_drift;

revoke execute on function public.begin_student_login(uuid, text, text, uuid)
  from service_role;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness requires service-role RPC execution'
);

rollback to savepoint login_rpc_service_acl_drift;

savepoint login_rpc_custom_acl_drift;

grant execute on function public.begin_student_login(uuid, text, text, uuid)
  to readiness_security_owner;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects custom-role RPC grants'
);

rollback to savepoint login_rpc_custom_acl_drift;

savepoint login_rpc_grant_option_drift;

grant execute on function public.begin_student_login(uuid, text, text, uuid)
  to service_role with grant option;

select is(
  public.get_production_readiness_report(
    'missing-version',
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )->>'studentLoginSecurityReady',
  'false',
  'student-login security readiness rejects RPC grant options'
);

rollback to savepoint login_rpc_grant_option_drift;

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
