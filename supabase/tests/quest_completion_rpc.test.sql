begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

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
    'completion-teacher@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'a2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'completion-student@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'completion-other@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('a1000000-0000-0000-0000-000000000001', 'teacher'),
  ('a2000000-0000-0000-0000-000000000001', 'student'),
  ('a2000000-0000-0000-0000-000000000002', 'student');

insert into public.cohorts (
  id,
  teacher_id,
  title,
  group_count,
  group_capacity
)
values (
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'Synthetic completion cohort',
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
  'a3000000-0000-0000-0000-000000000001',
  (
    select id
    from public.groups
    where cohort_id = 'a3000000-0000-0000-0000-000000000001'
      and group_number = 1
  ),
  real_name
from (
  values
    (
      'a2000000-0000-0000-0000-000000000001'::uuid,
      'Synthetic Completion Student'
    ),
    (
      'a2000000-0000-0000-0000-000000000002'::uuid,
      'Synthetic Other Student'
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
  'a4000000-0000-0000-0000-000000000001',
  'synthetic-completion-v1',
  extensions.digest('synthetic-completion-v1', 'sha256'),
  24,
  8
);

insert into content.concepts (version_id, concept_id)
select
  'a4000000-0000-0000-0000-000000000001',
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
    'a5000000-0000-4000-8000-' ||
    lpad(((concept_number - 1) * 3 + question_number)::text, 12, '0')
  )::uuid,
  'a4000000-0000-0000-0000-000000000001',
  'C' || concept_number || '-Q' || question_number,
  'C' || concept_number,
  case question_number
    when 1 then 'diagnostic'
    when 2 then 'practice'
    else 'final'
  end,
  'Synthetic completion item ' || concept_number || '-' ||
    question_number || ' contains no protected course content.',
  'single-choice',
  jsonb_build_object(
    'kind', 'single-choice',
    'options', jsonb_build_array(
      jsonb_build_object('id', 'A', 'text', 'Synthetic option A'),
      jsonb_build_object('id', 'B', 'text', 'Synthetic option B')
    ),
    'correctOptionIds', jsonb_build_array('A')
  ),
  jsonb_build_array('A'),
  'Synthetic option A is correct only for this completion boundary test.',
  array['C' || concept_number || '-M1']
from generate_series(1, 8) as concept_number
cross join generate_series(1, 3) as question_number;

insert into public.quest_attempts (
  id,
  student_id,
  cohort_id,
  content_version_id,
  current_phase,
  phase_deadline_at,
  last_accepted_sequence
)
values (
  'a6000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'retry',
  now() + interval '3 minutes',
  8
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
select
  (
    'a7000000-0000-4000-8000-' ||
    lpad(concept_number::text, 12, '0')
  )::uuid,
  'a6000000-0000-0000-0000-000000000001',
  (
    'a5000000-0000-4000-8000-' ||
    lpad(((concept_number - 1) * 3 + 3)::text, 12, '0')
  )::uuid,
  'final',
  concept_number,
  'developing',
  now(),
  now()
from generate_series(1, 8) as concept_number;

insert into public.student_responses (
  attempt_id,
  student_id,
  item_id,
  assignment_id,
  phase,
  selected_option_ids,
  correct,
  misconception_tag,
  confidence,
  idempotency_key,
  client_sequence,
  result_payload
)
select
  'a6000000-0000-0000-0000-000000000001'::uuid,
  'a2000000-0000-0000-0000-000000000001',
  attempt_items.item_id,
  attempt_items.id,
  'final',
  case when attempt_items.sequence <= 6 then array['A'] else array['B'] end,
  attempt_items.sequence <= 6,
  case
    when attempt_items.sequence <= 6 then null
    else 'C' || attempt_items.sequence || '-M1'
  end,
  'somewhat_sure',
  gen_random_uuid(),
  attempt_items.sequence,
  '{}'::jsonb
from public.attempt_items
where attempt_id = 'a6000000-0000-0000-0000-000000000001'
  and phase = 'final';

insert into public.concept_evidence (
  attempt_id,
  concept_id,
  phase,
  correct_count,
  total_count,
  support_state
)
select
  'a6000000-0000-0000-0000-000000000001'::uuid,
  'C' || concept_number,
  'diagnostic',
  case when concept_number <= 3 then 1 else 0 end,
  1,
  case when concept_number <= 3 then 'secure' else 'needs_support' end
from generate_series(1, 8) as concept_number
union all
select
  'a6000000-0000-0000-0000-000000000001',
  'C' || concept_number,
  'final',
  case when concept_number <= 6 then 1 else 0 end,
  1,
  case when concept_number <= 6 then 'secure' else 'needs_support' end
from generate_series(1, 8) as concept_number;

insert into public.phase_progress (
  attempt_id,
  phase,
  required_item_count,
  completed_item_count,
  completed_at
)
values
  (
    'a6000000-0000-0000-0000-000000000001',
    'diagnostic',
    8,
    8,
    now()
  ),
  (
    'a6000000-0000-0000-0000-000000000001',
    'mission',
    6,
    6,
    now()
  ),
  (
    'a6000000-0000-0000-0000-000000000001',
    'final',
    8,
    8,
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.get_next_learning_item(
      'a6000000-0000-0000-0000-000000000001'
    )$$,
  'a retry item is available after the final'
);

select is(
  (
    select array_agg(item_id::text order by item_id::text)
    from public.attempt_items
    where attempt_items.attempt_id =
      'a6000000-0000-0000-0000-000000000001'
      and attempt_items.phase = 'retry'
  ),
  array[
    'a5000000-0000-4000-8000-000000000020',
    'a5000000-0000-4000-8000-000000000023'
  ]::text[],
  'retry assignments target only final misconceptions'
);

select is(
  (
    public.get_next_learning_item(
      'a6000000-0000-0000-0000-000000000001'
    )->>'formative'
  )::boolean,
  true,
  'the retry item is explicitly formative'
);

select lives_ok(
  $$select public.submit_learning_response(
      'a6000000-0000-0000-0000-000000000001',
      (
        public.get_next_learning_item(
          'a6000000-0000-0000-0000-000000000001'
        )->>'assignmentId'
      )::uuid,
      'a8000000-0000-4000-8000-000000000001',
      array['A'],
      9,
      'very_sure'
    )$$,
  'the first formative retry can be submitted'
);

select lives_ok(
  $$select public.submit_learning_response(
      'a6000000-0000-0000-0000-000000000001',
      (
        public.get_next_learning_item(
          'a6000000-0000-0000-0000-000000000001'
        )->>'assignmentId'
      )::uuid,
      'a8000000-0000-4000-8000-000000000002',
      array['A'],
      10,
      'very_sure'
    )$$,
  'the second formative retry can be submitted'
);

select is(
  (
    select current_phase
    from public.quest_attempts
    where id = 'a6000000-0000-0000-0000-000000000001'
  ),
  'reflection',
  'retry completion advances to reflection'
);

select is(
  public.get_reflection_prompt(
    'a6000000-0000-0000-0000-000000000001'
  )->>'conceptId',
  'C7',
  'the structured reflection prompt targets the weakest final concept'
);

select is(
  (
    public.complete_quest(
      'a6000000-0000-0000-0000-000000000001',
      'a9000000-0000-4000-8000-000000000001',
      'apply',
      'I will use a worked example before group practice.'
    )->>'individualContribution'
  )::integer,
  75,
  'completion persists the approved 60/25/10/5 contribution'
);

select results_eq(
  $$select
      final_correct::integer,
      retry_correct::integer,
      retry_formative
    from public.quest_results
    where attempt_id = 'a6000000-0000-0000-0000-000000000001'$$,
  $$values (6, 2, true)$$,
  'retry evidence stays separate from the original final score'
);

select is(
  (
    select team_score::integer
    from public.team_score_snapshots
    where cohort_id = 'a3000000-0000-0000-0000-000000000001'
  ),
  75,
  'the published snapshot contains only the aggregate team score'
);

select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-0000-0000-000000000002',
  true
);

select results_eq(
  $$select count(*)::bigint
    from public.quest_reflections
    where attempt_id = 'a6000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'another student cannot read the private reflection'
);

select * from finish();
rollback;
