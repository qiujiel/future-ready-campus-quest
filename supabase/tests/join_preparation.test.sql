begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_function(
  'public',
  'prepare_student_code_join',
  array['text', 'uuid', 'text'],
  'the combined replay and preflight RPC exists'
);

select has_function(
  'public',
  'prepare_student_class_code_join',
  array['text', 'uuid', 'text', 'uuid'],
  'the class-scoped combined replay and preflight RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.prepare_student_code_join(text, uuid, text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.prepare_student_code_join(text, uuid, text)',
    'execute'
  ),
  'only the trusted service boundary can prepare joins'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.prepare_student_class_code_join(text, uuid, text, uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.prepare_student_class_code_join(text, uuid, text, uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.prepare_student_class_code_join(text, uuid, text, uuid)',
    'execute'
  ),
  'only the trusted service boundary can prepare class-scoped joins'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'prepare-owner@example.invalid', '',
    now(), '{"role":"teacher"}', '{}', now(), now()
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'prepare-student@example.invalid', '',
    now(), '{}', '{}', now(), now()
  );

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity, student_access_id
)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'Combined preparation classroom',
  1,
  2,
  'e5000000-0000-4000-8000-000000000001'
);

insert into public.cohort_join_windows (
  id, cohort_id, token_hash, request_key, expires_at, created_by
)
values (
  'e3000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'e4000000-0000-4000-8000-000000000001',
  now() + interval '15 minutes',
  'e1000000-0000-4000-8000-000000000001'
);

insert into public.cohort_group_join_codes (
  cohort_id, join_window_id, group_id, code_hash
)
select
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  id,
  repeat('b', 64)
from public.groups
where cohort_id = 'e2000000-0000-4000-8000-000000000001'
  and group_number = 1;

select results_eq(
  $$select completed, cohort_id, group_number::integer
    from public.prepare_student_class_code_join(
      repeat('b', 64),
      'e4000000-0000-4000-8000-000000000002',
      repeat('c', 64),
      'e5000000-0000-4000-8000-000000000001'
    )$$,
  $$values (
    false,
    'e2000000-0000-4000-8000-000000000001'::uuid,
    1
  )$$,
  'a new request receives its class and group from the protected preflight'
);

select is(
  (select count(*) from private.join_attempts),
  1::bigint,
  'a new prepared request consumes exactly one rate-limit attempt'
);

select is_empty(
  $$select *
    from public.prepare_student_class_code_join(
      repeat('b', 64),
      'e4000000-0000-4000-8000-000000000003',
      repeat('d', 64),
      'e5000000-0000-4000-8000-000000000099'
    )$$,
  'a valid group code is hidden from the wrong class scope'
);

select is(
  (select count(*) from private.join_attempts),
  2::bigint,
  'a wrong class scope still consumes its protected rate-limit attempt'
);

select lives_ok(
  $$select * from public.complete_student_code_join(
    repeat('b', 64),
    'e4000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    'Prepared Learner'
  )$$,
  'the prepared request completes normally'
);

select results_eq(
  $$select completed, student_id, group_number::integer
    from public.prepare_student_class_code_join(
      repeat('b', 64),
      'e4000000-0000-4000-8000-000000000002',
      repeat('e', 64),
      'e5000000-0000-4000-8000-000000000001'
    )$$,
  $$values (
    true,
    'e1000000-0000-4000-8000-000000000002'::uuid,
    1
  )$$,
  'a replay returns the completed identity from the same trusted call'
);

select is(
  (select count(*) from private.join_attempts),
  2::bigint,
  'a completed replay does not consume another rate-limit attempt'
);

select is_empty(
  $$select *
    from public.prepare_student_class_code_join(
      repeat('b', 64),
      'e4000000-0000-4000-8000-000000000002',
      repeat('f', 64),
      'e5000000-0000-4000-8000-000000000099'
    )$$,
  'a completed replay is also hidden from the wrong class scope'
);

select is(
  (select count(*) from private.join_attempts),
  2::bigint,
  'a wrong-scope completed replay does not consume another rate-limit attempt'
);

select * from finish();

rollback;
