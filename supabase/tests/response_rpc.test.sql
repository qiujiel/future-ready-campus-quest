begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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
    '91000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'response-teacher@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '92000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'response-student-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'response-student-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('91000000-0000-0000-0000-000000000001', 'teacher'),
  ('92000000-0000-0000-0000-000000000001', 'student'),
  ('92000000-0000-0000-0000-000000000002', 'student');

insert into public.cohorts (
  id,
  teacher_id,
  title,
  group_count,
  group_capacity
)
values (
  '93000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'Synthetic response cohort',
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
  '93000000-0000-0000-0000-000000000001',
  (
    select id
    from public.groups
    where cohort_id = '93000000-0000-0000-0000-000000000001'
      and group_number = 1
  ),
  real_name
from (
  values
    (
      '92000000-0000-0000-0000-000000000001'::uuid,
      'Synthetic Response Student One'
    ),
    (
      '92000000-0000-0000-0000-000000000002'::uuid,
      'Synthetic Response Student Two'
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
  '94000000-0000-0000-0000-000000000001',
  'synthetic-response-v1',
  extensions.digest('synthetic-response-v1', 'sha256'),
  24,
  8
);

insert into content.concepts (version_id, concept_id)
select
  '94000000-0000-0000-0000-000000000001',
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
select
  (
    '95000000-0000-4000-8000-' ||
    lpad(((concept_number - 1) * 3 + question_number)::text, 12, '0')
  )::uuid,
  '94000000-0000-0000-0000-000000000001',
  'C' || concept_number || '-Q' || question_number,
  'C' || concept_number,
  case question_number
    when 1 then 'diagnostic'
    when 2 then 'practice'
    else 'final'
  end,
  'Synthetic response item ' || concept_number || '-' || question_number ||
    ' contains no protected course content.',
  'single-choice',
  jsonb_build_object(
    'kind', 'single-choice',
    'options', jsonb_build_array(
      jsonb_build_object('id', 'A', 'text', 'Synthetic option A'),
      jsonb_build_object('id', 'B', 'text', 'Synthetic option B'),
      jsonb_build_object('id', 'C', 'text', 'Synthetic option C')
    ),
    'correctOptionIds', jsonb_build_array('A')
  ),
  jsonb_build_array('A'),
  'Synthetic option A is correct only for this database boundary test.',
  array['C' || concept_number || '-M1']
from generate_series(1, 8) as concept_number
cross join generate_series(1, 3) as question_number;

insert into content.item_source_refs (
  item_id,
  source_document,
  page_start
)
select id, 'overview-ict', 1
from content.learning_items
where version_id = '94000000-0000-0000-0000-000000000001';

insert into public.quest_attempts (
  id,
  student_id,
  cohort_id,
  content_version_id,
  current_phase,
  phase_deadline_at
)
values (
  '96000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  'diagnostic',
  now() + interval '5 minutes'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.get_next_learning_item(
      '96000000-0000-0000-0000-000000000001'
    )$$,
  'the student can request their next assigned item'
);

select results_eq(
  $$select count(*)::bigint
    from public.attempt_items
    where attempt_id = '96000000-0000-0000-0000-000000000001'
      and phase = 'diagnostic'$$,
  array[8::bigint],
  'the diagnostic assigns one item for every C1-C8 concept'
);

select ok(
  not (
    public.get_next_learning_item(
      '96000000-0000-0000-0000-000000000001'
    )->'interaction'
    ?| array[
      'correctOptionIds',
      'correctOrderIds',
      'correctCategoryByPrompt'
    ]
  )
  and not (
    public.get_next_learning_item(
      '96000000-0000-0000-0000-000000000001'
    )
    ?| array['correct', 'explanation', 'misconceptionTag']
  ),
  'the current item payload omits answers and explanation'
);

select is(
  (
    public.submit_learning_response(
      '96000000-0000-0000-0000-000000000001',
      (
        public.get_next_learning_item(
          '96000000-0000-0000-0000-000000000001'
        )->>'assignmentId'
      )::uuid,
      '97000000-0000-4000-8000-000000000001',
      array['A'],
      1,
      'very_sure'
    )->>'correct'
  )::boolean,
  true,
  'the server scores the accepted response from the private answer'
);

select is(
  public.submit_learning_response(
    '96000000-0000-0000-0000-000000000001',
    (
      select assignment_id
      from public.student_responses
      where idempotency_key = '97000000-0000-4000-8000-000000000001'
    ),
    '97000000-0000-4000-8000-000000000001',
    array['B'],
    1,
    'unsure'
  )->>'responseId',
  (
    select id::text
    from public.student_responses
    where idempotency_key = '97000000-0000-4000-8000-000000000001'
  ),
  'an idempotent replay returns the original response'
);

select results_eq(
  $$select count(*)::bigint
    from public.student_responses
    where attempt_id = '96000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'the replay does not create a duplicate response'
);

select throws_ok(
  $$select public.submit_learning_response(
      '96000000-0000-0000-0000-000000000001',
      (
        public.get_next_learning_item(
          '96000000-0000-0000-0000-000000000001'
        )->>'assignmentId'
      )::uuid,
      '97000000-0000-4000-8000-000000000002',
      array['A'],
      1,
      'somewhat_sure'
    )$$,
  'P0001',
  'STALE_SEQUENCE',
  'a stale client sequence is rejected'
);

select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-0000-0000-000000000002',
  true
);

select throws_ok(
  $$select public.submit_learning_response(
      '96000000-0000-0000-0000-000000000001',
      (
        select id
        from public.attempt_items
        where attempt_id = '96000000-0000-0000-0000-000000000001'
        order by sequence
        limit 1
      ),
      '97000000-0000-4000-8000-000000000003',
      array['A'],
      2,
      'very_sure'
    )$$,
  'P0001',
  'ASSIGNMENT_NOT_AVAILABLE',
  'another student cannot submit an assigned item'
);

select * from finish();
rollback;
