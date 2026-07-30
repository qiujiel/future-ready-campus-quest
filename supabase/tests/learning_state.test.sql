begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table(
  'public',
  'quest_attempts',
  'quest attempts store the server-authoritative phase'
);

select has_table(
  'public',
  'phase_progress',
  'phase progress is stored separately'
);

select has_table(
  'public',
  'concept_evidence',
  'concept evidence preserves phase separation'
);

select has_table(
  'public',
  'student_responses',
  'student responses are immutable server-owned records'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'quest_attempts'
      and indexname = 'quest_attempts_one_active_per_student_idx'
  ),
  'one active attempt is enforced per student and cohort'
);

select ok(
  not has_table_privilege('anon', 'public.quest_attempts', 'select'),
  'anonymous callers cannot read quest attempts'
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
    '71000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'route-teacher@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '72000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'route-student-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'route-student-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('71000000-0000-0000-0000-000000000001', 'teacher'),
  ('72000000-0000-0000-0000-000000000001', 'student'),
  ('72000000-0000-0000-0000-000000000002', 'student');

insert into public.cohorts (
  id,
  teacher_id,
  title,
  group_count,
  group_capacity
)
values (
  '73000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'Synthetic routing cohort',
  1,
  2
);

insert into public.student_private_profiles (
  student_id,
  cohort_id,
  group_id,
  real_name
)
select
  student_id,
  '73000000-0000-0000-0000-000000000001',
  (
    select id
    from public.groups
    where cohort_id = '73000000-0000-0000-0000-000000000001'
      and group_number = 1
  ),
  real_name
from (
  values
    (
      '72000000-0000-0000-0000-000000000001'::uuid,
      'Synthetic Route Student One'
    ),
    (
      '72000000-0000-0000-0000-000000000002'::uuid,
      'Synthetic Route Student Two'
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
  '74000000-0000-0000-0000-000000000001',
  'synthetic-route-v1',
  extensions.digest('synthetic-route-v1', 'sha256'),
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
values
  (
    '75000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
    'diagnostic',
    now() + interval '5 minutes'
  ),
  (
    '75000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
    'diagnostic',
    now() + interval '5 minutes'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  $$select id from public.quest_attempts order by id$$,
  array['75000000-0000-0000-0000-000000000001'::uuid],
  'a student reads only their own attempt'
);

select throws_ok(
  $$insert into public.quest_attempts (
      student_id,
      cohort_id,
      content_version_id,
      current_phase,
      phase_deadline_at
    )
    values (
      '72000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      'mission',
      now() + interval '14 minutes'
    )$$,
  '42501',
  'permission denied for table quest_attempts',
  'students cannot create attempts directly'
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
      '72000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      'mission',
      now() + interval '14 minutes'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "quest_attempts_one_active_per_student_idx"',
  'the database rejects a second active attempt for the same student'
);

select * from finish();
rollback;
