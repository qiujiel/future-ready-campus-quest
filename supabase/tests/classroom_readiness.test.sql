begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_function(
  'public',
  'get_teacher_classroom_readiness',
  array['uuid'],
  'classroom readiness is exposed through one teacher-owned RPC'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    'b1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'readiness-owner@example.invalid', '',
    now(), '{"role":"teacher"}', '{}', now(), now()
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'readiness-other@example.invalid', '',
    now(), '{"role":"teacher"}', '{}', now(), now()
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'readiness-student-1@example.invalid', '',
    now(), '{"role":"student"}', '{}', now(), now()
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'readiness-student-2@example.invalid', '',
    now(), '{"role":"student"}', '{}', now(), now()
  );

insert into public.user_roles (user_id, role)
values
  ('b1000000-0000-0000-0000-000000000001', 'teacher'),
  ('b1000000-0000-0000-0000-000000000002', 'teacher'),
  ('b2000000-0000-0000-0000-000000000001', 'student'),
  ('b2000000-0000-0000-0000-000000000002', 'student');

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity
)
values (
  'b3000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'Readiness classroom',
  2,
  3
);

insert into public.cohort_join_windows (
  id, cohort_id, token_hash, request_key, expires_at, created_by
)
values (
  'b4000000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001',
  repeat('f', 64),
  'b5000000-0000-0000-0000-000000000001',
  now() + interval '10 minutes',
  'b1000000-0000-0000-0000-000000000001'
);

insert into public.cohort_group_join_codes (
  join_window_id, cohort_id, group_id, code_hash
)
select
  'b4000000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001',
  groups.id,
  case groups.group_number when 1 then repeat('a', 64) else repeat('b', 64) end
from public.groups as groups
where groups.cohort_id = 'b3000000-0000-0000-0000-000000000001';

insert into public.student_private_profiles (
  student_id, cohort_id, group_id, real_name, joined_at
)
values
  (
    'b2000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000001',
    (
      select id from public.groups
      where cohort_id = 'b3000000-0000-0000-0000-000000000001'
        and group_number = 1
    ),
    'Synthetic Learner One',
    '2026-08-06T01:01:00.000Z'
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    'b3000000-0000-0000-0000-000000000001',
    (
      select id from public.groups
      where cohort_id = 'b3000000-0000-0000-0000-000000000001'
        and group_number = 2
    ),
    'Synthetic Learner Two',
    '2026-08-06T01:02:00.000Z'
  );

insert into public.student_public_profiles (
  student_id, cohort_id, group_id, nickname
)
select student_id, cohort_id, group_id, 'Explorer ' || row_number() over ()::text
from public.student_private_profiles
where cohort_id = 'b3000000-0000-0000-0000-000000000001';

insert into content.content_versions (
  id, version_key, payload_digest, item_count, concept_count
)
values (
  'b6000000-0000-0000-0000-000000000001',
  'readiness-v1',
  extensions.digest('readiness-v1', 'sha256'),
  24,
  8
);

insert into public.quest_attempts (
  id, student_id, cohort_id, content_version_id, current_phase,
  started_at, phase_started_at, phase_deadline_at
)
values (
  'b7000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001',
  'b6000000-0000-0000-0000-000000000001',
  'diagnostic',
  '2026-08-06T01:04:00.000Z',
  '2026-08-06T01:04:00.000Z',
  '2026-08-06T01:09:00.000Z'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select concat_ws(',',
      (report ->> 'expected')::integer,
      (report ->> 'joined')::integer,
      (report ->> 'active')::integer,
      (report ->> 'started')::integer,
      (report ->> 'submitted')::integer,
      (report ->> 'incomplete')::integer
    )
    from (
      select public.get_teacher_classroom_readiness(
        'b3000000-0000-0000-0000-000000000001'
      ) as report
    ) as readiness$$,
  array['6,2,1,1,0,1'],
  'the owning teacher receives correct readiness counts'
);

select results_eq(
  $$select jsonb_array_length(report -> 'groups')
    from (
      select public.get_teacher_classroom_readiness(
        'b3000000-0000-0000-0000-000000000001'
      ) as report
    ) as readiness$$,
  array[2],
  'the report contains every configured group'
);

select ok(
  public.get_teacher_classroom_readiness(
    'b3000000-0000-0000-0000-000000000001'
  )::text like '%Synthetic Learner One%'
  and public.get_teacher_classroom_readiness(
    'b3000000-0000-0000-0000-000000000001'
  )::text like '%Synthetic Learner Two%',
  'the owning teacher sees recognizable student names'
);

select ok(
  public.get_teacher_classroom_readiness(
    'b3000000-0000-0000-0000-000000000001'
  ) -> 'joining' ->> 'requestKey'
    = 'b5000000-0000-0000-0000-000000000001'
  and public.get_teacher_classroom_readiness(
    'b3000000-0000-0000-0000-000000000001'
  )::text not like '%' || repeat('a', 64) || '%',
  'the trusted report supplies the derivation key but never a stored code hash'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.get_teacher_classroom_readiness(
      'b3000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'COHORT_NOT_AVAILABLE',
  'another teacher receives the neutral cohort denial'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b2000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.get_teacher_classroom_readiness(
      'b3000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'COHORT_NOT_AVAILABLE',
  'a student receives the same neutral cohort denial'
);

select * from finish();
rollback;
