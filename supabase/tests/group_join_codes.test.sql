begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_table(
  'public',
  'cohort_group_join_codes',
  'group join codes have a dedicated protected mapping table'
);

select ok(
  not has_table_privilege('anon', 'public.cohort_group_join_codes', 'select')
  and not has_table_privilege(
    'authenticated',
    'public.cohort_group_join_codes',
    'select'
  ),
  'raw callers cannot read group-code hashes'
);

select has_function(
  'public',
  'configure_cohort_group_join_codes',
  array['uuid', 'uuid', 'jsonb'],
  'the teacher-owned configuration RPC exists'
);

select has_function(
  'public',
  'set_group_join_code_enabled',
  array['uuid', 'uuid', 'boolean', 'uuid'],
  'the teacher can disable one group code without closing the cohort'
);

select has_function(
  'public',
  'preflight_student_code_join',
  array['text', 'text'],
  'the trusted code preflight RPC exists'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'a1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'group-code-owner@example.invalid',
    '',
    now(),
    '{"role":"teacher"}',
    '{}',
    now(),
    now()
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'group-code-other@example.invalid',
    '',
    now(),
    '{"role":"teacher"}',
    '{}',
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('a1000000-0000-0000-0000-000000000001', 'teacher'),
  ('a1000000-0000-0000-0000-000000000002', 'teacher');

insert into public.cohorts (
  id,
  teacher_id,
  title,
  group_count,
  group_capacity
)
values (
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'Group-code classroom',
  2,
  3
);

insert into public.cohort_join_windows (
  id,
  cohort_id,
  token_hash,
  request_key,
  expires_at,
  created_by
)
values (
  'a3000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  repeat('f', 64),
  'a4000000-0000-0000-0000-000000000001',
  now() + interval '10 minutes',
  'a1000000-0000-0000-0000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  format(
    $$select public.configure_cohort_group_join_codes(
      'a2000000-0000-0000-0000-000000000001',
      'a3000000-0000-0000-0000-000000000001',
      %L::jsonb
    )$$,
    (
      select jsonb_agg(
        jsonb_build_object(
          'groupId', id,
          'codeHash', case group_number
            when 1 then repeat('a', 64)
            else repeat('b', 64)
          end
        )
        order by group_number
      )::text
      from public.groups
      where cohort_id = 'a2000000-0000-0000-0000-000000000001'
    )
  ),
  'the owning teacher can configure one hash per group'
);

reset role;

select results_eq(
  $$select count(*)::bigint
    from public.cohort_group_join_codes
    where join_window_id = 'a3000000-0000-0000-0000-000000000001'$$,
  array[2::bigint],
  'the window stores exactly one code mapping per group'
);

select is_empty(
  $$select code_hash
    from public.cohort_group_join_codes
    where code_hash in ('FJP5Z8YN', 'CAMPUS42')$$,
  'the database stores hashes and never raw classroom codes'
);

select results_eq(
  $$select public.preflight_student_code_join(
      repeat('a', 64),
      repeat('c', 64)
    )::integer$$,
  array[1],
  'a valid code resolves its group number at the trusted boundary'
);

select throws_ok(
  $$select public.preflight_student_code_join(
      repeat('9', 64),
      repeat('c', 64)
    )$$,
  'P0001',
  'INVALID_JOIN_CODE',
  'an unknown hash returns the neutral invalid-code error'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.set_group_join_code_enabled(
      'a2000000-0000-0000-0000-000000000001',
      (
        select id from public.groups
        where cohort_id = 'a2000000-0000-0000-0000-000000000001'
          and group_number = 1
      ),
      false,
      'a4000000-0000-0000-0000-000000000002'
    )$$,
  'the owning teacher can disable one group code'
);

reset role;

select throws_ok(
  $$select public.preflight_student_code_join(
      repeat('a', 64),
      repeat('d', 64)
    )$$,
  'P0001',
  'GROUP_JOIN_CLOSED',
  'a disabled group code cannot authorize a student'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.set_group_join_code_enabled(
  'a2000000-0000-0000-0000-000000000001',
  (
    select id from public.groups
    where cohort_id = 'a2000000-0000-0000-0000-000000000001'
      and group_number = 1
  ),
  true,
  'a4000000-0000-0000-0000-000000000003'
);
select public.close_cohort_join_window(
  'a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000004'
);

reset role;

select throws_ok(
  $$select public.preflight_student_code_join(
      repeat('a', 64),
      repeat('e', 64)
    )$$,
  'P0001',
  'GROUP_JOIN_CLOSED',
  'closing the window invalidates every group code immediately'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.configure_cohort_group_join_codes(uuid,uuid,jsonb)',
    'execute'
  ),
  'browser callers cannot invoke the split group-code configuration RPC'
);

select * from finish();
rollback;
