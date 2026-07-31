begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_function(
  'public',
  'assert_teacher_control_scope',
  array['uuid', 'uuid', 'uuid'],
  'teacher control targets are checked by a dedicated scope boundary'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.user_roles',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'public.user_roles',
    'insert'
  ),
  'only trusted provisioning can assign teacher roles'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.cohorts',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cohorts',
    'insert'
  ),
  'direct cohort provisioning remains server-only'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.cohort_join_windows',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cohort_join_windows',
    'insert'
  ),
  'direct join-window provisioning remains server-only'
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
    'e1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gate-d-owner@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gate-d-other-teacher@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'e2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gate-d-student-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gate-d-student-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('e1000000-0000-0000-0000-000000000001', 'teacher'),
  ('e1000000-0000-0000-0000-000000000002', 'teacher'),
  ('e2000000-0000-0000-0000-000000000001', 'student'),
  ('e2000000-0000-0000-0000-000000000002', 'student');

insert into public.cohorts (
  id,
  teacher_id,
  title,
  group_count,
  group_capacity,
  archived_at
)
values
  (
    'e3000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'Gate D active cohort',
    1,
    6,
    null
  ),
  (
    'e3000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    'Gate D archived cohort',
    1,
    6,
    now()
  );

insert into public.student_private_profiles (
  student_id,
  cohort_id,
  group_id,
  real_name
)
select
  student_id,
  'e3000000-0000-0000-0000-000000000001',
  (
    select id
    from public.groups
    where cohort_id = 'e3000000-0000-0000-0000-000000000001'
      and group_number = 1
  ),
  real_name
from (
  values
    (
      'e2000000-0000-0000-0000-000000000001'::uuid,
      'Gate D Student One'
    ),
    (
      'e2000000-0000-0000-0000-000000000002'::uuid,
      'Gate D Student Two'
    )
) as students(student_id, real_name);

insert into content.content_versions (
  id,
  version_key,
  payload_digest,
  item_count,
  concept_count
)
values (
  'e4000000-0000-0000-0000-000000000001',
  'gate-d-security-v1',
  extensions.digest('gate-d-security-v1', 'sha256'),
  24,
  8
);

insert into public.quest_attempts (
  id,
  student_id,
  cohort_id,
  content_version_id,
  current_phase,
  phase_deadline_at
)
values (
  'e5000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001',
  'e3000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'diagnostic',
  now() + interval '5 minutes'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.assert_teacher_control_scope(
      'e3000000-0000-0000-0000-000000000001',
      null,
      'e2000000-0000-0000-0000-000000000001'
    )$$,
  'the owning teacher can target a student in the cohort'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.assert_teacher_control_scope(
      'e3000000-0000-0000-0000-000000000001',
      null,
      'e2000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'CONTROL_NOT_AVAILABLE',
  'another teacher receives the neutral control denial'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e2000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.assert_teacher_control_scope(
      'e3000000-0000-0000-0000-000000000001',
      null,
      'e2000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'CONTROL_NOT_AVAILABLE',
  'a student receives the same neutral control denial'
);

reset role;

select throws_ok(
  $$insert into public.cohort_join_windows (
      cohort_id,
      token_hash,
      request_key,
      expires_at,
      created_by
    )
    values (
      'e3000000-0000-0000-0000-000000000002',
      repeat('a', 64),
      'e6000000-0000-0000-0000-000000000001',
      now() + interval '10 minutes',
      'e1000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'COHORT_NOT_AVAILABLE',
  'an archived cohort cannot reopen joining'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.apply_teacher_control(
  'e3000000-0000-0000-0000-000000000001',
  'set-quest-starts',
  null,
  null,
  false,
  'e6000000-0000-0000-0000-000000000002'
);
reset role;

select throws_ok(
  $$insert into public.quest_attempts (
      student_id,
      cohort_id,
      content_version_id,
      current_phase,
      phase_deadline_at
    )
    values (
      'e2000000-0000-0000-0000-000000000002',
      'e3000000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001',
      'diagnostic',
      now() + interval '5 minutes'
    )$$,
  'P0001',
  'QUEST_STARTS_PAUSED',
  'the database rejects new quest attempts while starts are paused'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    public.close_teacher_session(
      'e3000000-0000-0000-0000-000000000001',
      'e6000000-0000-0000-0000-000000000003'
    )->>'affected'
  )::integer,
  1,
  'closing a session reports the active students it affected'
);
reset role;

select is(
  (
    select status
    from public.quest_attempts
    where id = 'e5000000-0000-0000-0000-000000000001'
  ),
  'abandoned',
  'closing a session abandons its active attempts'
);

select throws_ok(
  $$insert into public.cohort_join_windows (
      cohort_id,
      token_hash,
      request_key,
      expires_at,
      created_by
    )
    values (
      'e3000000-0000-0000-0000-000000000001',
      repeat('b', 64),
      'e6000000-0000-0000-0000-000000000004',
      now() + interval '10 minutes',
      'e1000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'COHORT_NOT_AVAILABLE',
  'joining cannot be reopened after the class session is closed'
);

select * from finish();
rollback;
