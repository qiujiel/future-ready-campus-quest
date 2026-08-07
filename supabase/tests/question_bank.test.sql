begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function(
  'public',
  'get_teacher_question_bank',
  array['uuid'],
  'the teacher question-bank boundary exists'
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
    'authenticated', 'authenticated', 'bank-owner@example.invalid', '', now(),
    '{"role":"teacher"}', '{}', now(), now()
  ),
  (
    'e2000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bank-student@example.invalid', '', now(),
    '{"role":"student"}', '{}', now(), now()
  );

insert into public.user_roles (user_id, role)
values
  ('e1000000-0000-4000-8000-000000000001', 'teacher'),
  ('e2000000-0000-4000-8000-000000000001', 'student');

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity
)
values (
  'e3000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'Question bank classroom',
  1,
  3
);

create function pg_temp.synthetic_question_bank()
returns jsonb
language sql
as $$
  with generated_items as (
    select jsonb_build_object(
      'id', 'C' || concept_number || '-Q' || question_number,
      'conceptId', 'C' || concept_number,
      'form', case question_number
        when 1 then 'diagnostic'
        when 2 then 'practice'
        else 'final'
      end,
      'stem', 'Synthetic teacher-bank item ' || concept_number || '-' ||
        question_number || ' contains no protected course content.',
      'interaction', jsonb_build_object(
        'kind', 'single-choice',
        'options', jsonb_build_array(
          jsonb_build_object('id', 'A', 'text', 'Synthetic option A'),
          jsonb_build_object('id', 'B', 'text', 'Synthetic option B')
        ),
        'correctOptionIds', jsonb_build_array('A')
      ),
      'rationale', 'Synthetic option A is correct only for boundary testing.',
      'misconceptionTags', jsonb_build_array('C' || concept_number || '-M1'),
      'sourceRefs', jsonb_build_array(
        jsonb_build_object(
          'document', 'overview-ict',
          'pageStart', concept_number
        )
      )
    ) as item
    from generate_series(1, 8) as concept_number
    cross join generate_series(1, 3) as question_number
  )
  select jsonb_build_object(
    'version', 'public-synthetic-question-bank-v1',
    'items', jsonb_agg(item order by item->>'id')
  )
  from generated_items
$$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.import_learning_content(pg_temp.synthetic_question_bank());
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  jsonb_array_length(
    public.get_teacher_question_bank(
      'e3000000-0000-4000-8000-000000000001'
    )->'items'
  ),
  24,
  'the owning teacher receives all 24 reviewed questions'
);

select is(
  public.get_teacher_question_bank(
    'e3000000-0000-4000-8000-000000000001'
  )->'items'->0->'correctResponse'->>0,
  'A',
  'the teacher view includes the reviewed correct response'
);

select ok(
  not (
    public.get_teacher_question_bank(
      'e3000000-0000-4000-8000-000000000001'
    )->'items'->0->'interaction'
    ? 'correctOptionIds'
  ),
  'hidden correctness keys are removed from the interaction payload'
);

select set_config(
  'request.jwt.claim.sub',
  'e2000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$select public.get_teacher_question_bank(
      'e3000000-0000-4000-8000-000000000001'
    )$$,
  'P0001',
  'COHORT_NOT_AVAILABLE',
  'a student cannot read the teacher question bank'
);

select * from finish();
rollback;
