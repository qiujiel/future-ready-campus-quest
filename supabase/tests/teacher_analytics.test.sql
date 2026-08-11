begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function(
  'public',
  'get_teacher_dashboard_summary',
  array['uuid'],
  'the teacher dashboard is exposed through one scoped RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_teacher_dashboard_summary(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.get_teacher_dashboard_summary(uuid)',
    'execute'
  ),
  'only authenticated callers can execute the dashboard RPC'
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
    'd1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dashboard-owner@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dashboard-other-teacher@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'd2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dashboard-student@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('d1000000-0000-0000-0000-000000000001', 'teacher'),
  ('d1000000-0000-0000-0000-000000000002', 'teacher'),
  ('d2000000-0000-0000-0000-000000000001', 'student');

insert into public.cohorts (
  id,
  teacher_id,
  title,
  group_count,
  group_capacity
)
values
  (
    'd3000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'Synthetic dashboard cohort',
    1,
    6
  ),
  (
    'd3000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000002',
    'Other synthetic dashboard cohort',
    1,
    6
  );

insert into public.student_private_profiles (
  student_id,
  cohort_id,
  group_id,
  real_name
)
select
  'd2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  id,
  'Synthetic Dashboard Student'
from public.groups
where cohort_id = 'd3000000-0000-0000-0000-000000000001'
  and group_number = 1;

insert into content.content_versions (
  id,
  version_key,
  payload_digest,
  item_count,
  concept_count
)
values (
  'd4000000-0000-0000-0000-000000000001',
  'synthetic-dashboard-v1',
  extensions.digest('synthetic-dashboard-v1', 'sha256'),
  24,
  8
);

insert into content.concepts (version_id, concept_id)
select
  'd4000000-0000-0000-0000-000000000001',
  'C' || concept_number
from generate_series(1, 8) as concept_number;

insert into content.learning_items (
  id,
  version_id,
  item_key,
  concept_id,
  form,
  stem,
  interaction_kind,
  interaction_payload,
  correct_response,
  rationale,
  misconception_tags
)
values
  (
    'd5000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000001',
    'C1-Q1',
    'C1',
    'diagnostic',
    'Synthetic dashboard question one contains no protected content.',
    'single-choice',
    '{"kind":"single-choice","options":[{"id":"A","text":"A"},{"id":"B","text":"B"}]}'::jsonb,
    '["A"]'::jsonb,
    'Synthetic rationale for the focused teacher dashboard test only.',
    array['C1-M1']
  ),
  (
    'd5000000-0000-0000-0000-000000000002',
    'd4000000-0000-0000-0000-000000000001',
    'C2-Q3',
    'C2',
    'final',
    'Synthetic dashboard question two contains no protected content.',
    'single-choice',
    '{"kind":"single-choice","options":[{"id":"A","text":"A"},{"id":"B","text":"B"}]}'::jsonb,
    '["A"]'::jsonb,
    'Synthetic rationale for the focused teacher dashboard test only.',
    array['C2-M1']
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
  'd6000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000001',
  'final',
  now() + interval '5 minutes'
);

insert into public.attempt_items (
  id,
  attempt_id,
  item_id,
  phase,
  sequence,
  support_state,
  delivered_at,
  submitted_at
)
values
  (
    'd7000000-0000-0000-0000-000000000001',
    'd6000000-0000-0000-0000-000000000001',
    'd5000000-0000-0000-0000-000000000001',
    'diagnostic',
    1,
    'needs_support',
    now(),
    now()
  ),
  (
    'd7000000-0000-0000-0000-000000000002',
    'd6000000-0000-0000-0000-000000000001',
    'd5000000-0000-0000-0000-000000000002',
    'final',
    1,
    'secure',
    now(),
    now()
  );

insert into public.student_responses (
  attempt_id,
  student_id,
  item_id,
  assignment_id,
  phase,
  selected_option_ids,
  correct,
  misconception_tag,
  idempotency_key,
  client_sequence,
  result_payload
)
values
  (
    'd6000000-0000-0000-0000-000000000001',
    'd2000000-0000-0000-0000-000000000001',
    'd5000000-0000-0000-0000-000000000001',
    'd7000000-0000-0000-0000-000000000001',
    'diagnostic',
    array['B'],
    false,
    'C1-M1',
    'd8000000-0000-0000-0000-000000000001',
    1,
    '{}'::jsonb
  ),
  (
    'd6000000-0000-0000-0000-000000000001',
    'd2000000-0000-0000-0000-000000000001',
    'd5000000-0000-0000-0000-000000000002',
    'd7000000-0000-0000-0000-000000000002',
    'final',
    array['A'],
    true,
    null,
    'd8000000-0000-0000-0000-000000000002',
    2,
    '{}'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.get_teacher_dashboard_summary(
      'd3000000-0000-0000-0000-000000000001'
    )$$,
  'the owning teacher can load the dashboard'
);

select is(
  jsonb_array_length(
    public.get_teacher_dashboard_summary(
      'd3000000-0000-0000-0000-000000000001'
    )->'conceptAggregates'
  ),
  8,
  'the dashboard always returns C1 through C8'
);

select is(
  public.get_teacher_dashboard_summary(
    'd3000000-0000-0000-0000-000000000001'
  )#>>'{classFocus,conceptId}',
  'C1',
  'the dashboard identifies the class concept missed by the most students'
);

select is(
  public.get_teacher_dashboard_summary(
    'd3000000-0000-0000-0000-000000000001'
  )#>>'{teamScores,0,conceptFocus,missedQuestions,0,itemId}',
  'C1-Q1',
  'the team focus includes only the exact missed question key'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.get_teacher_dashboard_summary(
      'd3000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'COHORT_NOT_AVAILABLE',
  'a second teacher receives the neutral denial'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd2000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.get_teacher_dashboard_summary(
      'd3000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  'COHORT_NOT_AVAILABLE',
  'a student receives the same neutral denial'
);

select * from finish();
rollback;
