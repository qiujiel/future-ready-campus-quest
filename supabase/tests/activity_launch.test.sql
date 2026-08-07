begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

truncate table content.content_versions cascade;

select has_function(
  'public',
  'launch_cohort_quest',
  array['uuid', 'uuid'],
  'teachers launch all joined students through one atomic RPC'
);

select has_function(
  'public',
  'ensure_student_quest_attempt',
  array[]::text[],
  'late and reset students obtain only their own launched attempt'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  email,
  '',
  now(),
  metadata::jsonb,
  '{}',
  now(),
  now()
from (
  values
    ('c1000000-0000-4000-8000-000000000001'::uuid, 'launch-owner@example.invalid', '{"role":"teacher"}'),
    ('c1000000-0000-4000-8000-000000000002'::uuid, 'launch-other@example.invalid', '{"role":"teacher"}'),
    ('c2000000-0000-4000-8000-000000000001'::uuid, 'launch-student-1@example.invalid', '{"role":"student"}'),
    ('c2000000-0000-4000-8000-000000000002'::uuid, 'launch-student-2@example.invalid', '{"role":"student"}'),
    ('c2000000-0000-4000-8000-000000000003'::uuid, 'launch-removed@example.invalid', '{"role":"student"}'),
    ('c2000000-0000-4000-8000-000000000004'::uuid, 'launch-late@example.invalid', '{"role":"student"}')
) as users(id, email, metadata);

insert into public.user_roles (user_id, role)
values
  ('c1000000-0000-4000-8000-000000000001', 'teacher'),
  ('c1000000-0000-4000-8000-000000000002', 'teacher'),
  ('c2000000-0000-4000-8000-000000000001', 'student'),
  ('c2000000-0000-4000-8000-000000000002', 'student'),
  ('c2000000-0000-4000-8000-000000000003', 'student'),
  ('c2000000-0000-4000-8000-000000000004', 'student');

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity
)
values (
  'c3000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'Atomic launch classroom',
  2,
  3
);

insert into public.student_private_profiles (
  student_id, cohort_id, group_id, real_name, removed_at, removed_by
)
select
  students.student_id,
  'c3000000-0000-4000-8000-000000000001',
  groups.id,
  students.real_name,
  students.removed_at,
  case when students.removed_at is null then null
    else 'c1000000-0000-4000-8000-000000000001'::uuid end
from (
  values
    ('c2000000-0000-4000-8000-000000000001'::uuid, 1, 'Launch Student One', null::timestamptz),
    ('c2000000-0000-4000-8000-000000000002'::uuid, 1, 'Launch Student Two', null::timestamptz),
    ('c2000000-0000-4000-8000-000000000003'::uuid, 2, 'Removed Test Student', now())
) as students(student_id, group_number, real_name, removed_at)
join public.groups as groups
  on groups.cohort_id = 'c3000000-0000-4000-8000-000000000001'
  and groups.group_number = students.group_number;

insert into public.student_public_profiles (
  student_id, cohort_id, group_id, nickname
)
select student_id, cohort_id, group_id, 'Explorer ' || row_number() over ()::text
from public.student_private_profiles
where cohort_id = 'c3000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.launch_cohort_quest(
      'c3000000-0000-4000-8000-000000000001',
      'c6000000-0000-4000-8000-000000000001'
    )$$,
  'P0001',
  'CONTENT_NOT_READY',
  'launch fails closed until the complete protected bank is active'
);

reset role;

create function pg_temp.synthetic_content_bank()
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
      'stem', 'Synthetic launch item ' || concept_number || '-' || question_number ||
        ' contains no protected course-related content.',
      'interaction', jsonb_build_object(
        'kind', 'single-choice',
        'options', jsonb_build_array(
          jsonb_build_object('id', 'A', 'text', 'Synthetic option A'),
          jsonb_build_object('id', 'B', 'text', 'Synthetic option B'),
          jsonb_build_object('id', 'C', 'text', 'Synthetic option C')
        ),
        'correctOptionIds', jsonb_build_array('A')
      ),
      'rationale', 'Synthetic option A is correct only for launch testing.',
      'misconceptionTags', jsonb_build_array('C' || concept_number || '-M1'),
      'sourceRefs', jsonb_build_array(
        jsonb_build_object('document', 'overview-ict', 'pageStart', concept_number)
      )
    ) as item
    from generate_series(1, 8) as concept_number
    cross join generate_series(1, 3) as question_number
  )
  select jsonb_build_object(
    'version', 'public-synthetic-launch-v1',
    'items', jsonb_agg(item order by item->>'id')
  )
  from generated_items
$$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.import_learning_content(pg_temp.synthetic_content_bank());
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (public.launch_cohort_quest(
    'c3000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000002'
  ) ->> 'affected')::integer,
  2,
  'one launch creates an attempt for every active joined student'
);

select is(
  (select count(*)::integer from public.quest_attempts where cohort_id = 'c3000000-0000-4000-8000-000000000001'),
  2,
  'launch creates exactly two attempts'
);

select is(
  (select count(*)::integer from public.quest_attempts where student_id = 'c2000000-0000-4000-8000-000000000003'),
  0,
  'removed students never receive an attempt'
);

select is(
  (public.launch_cohort_quest(
    'c3000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000003'
  ) ->> 'affected')::integer,
  0,
  'a repeated launch cannot duplicate attempts'
);

reset role;

insert into public.student_private_profiles (
  student_id, cohort_id, group_id, real_name
)
select
  'c2000000-0000-4000-8000-000000000004',
  'c3000000-0000-4000-8000-000000000001',
  id,
  'Late Launch Student'
from public.groups
where cohort_id = 'c3000000-0000-4000-8000-000000000001'
  and group_number = 2;
insert into public.student_public_profiles (
  student_id, cohort_id, group_id, nickname
)
select student_id, cohort_id, group_id, 'Explorer Late'
from public.student_private_profiles
where student_id = 'c2000000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select isnt(
  public.ensure_student_quest_attempt(),
  null::uuid,
  'a late joiner receives an attempt after the cohort launch'
);

select is(
  (select count(*)::integer from public.quest_attempts where student_id = auth.uid() and status = 'active'),
  1,
  'late entry creates only one active attempt for the caller'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (public.manage_teacher_roster(
    'c3000000-0000-4000-8000-000000000001',
    'reset-student',
    'c2000000-0000-4000-8000-000000000001',
    null,
    'c6000000-0000-4000-8000-000000000004'
  ) ->> 'affected')::integer,
  1,
  'teacher reset closes the current active attempt'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.ensure_student_quest_attempt();

select results_eq(
  $$select concat_ws(',', count(*)::integer, count(*) filter (where status = 'active')::integer)
    from public.quest_attempts
    where student_id = 'c2000000-0000-4000-8000-000000000001'$$,
  array['2,1'],
  'reset preserves the old attempt and creates exactly one new active attempt'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.launch_cohort_quest(
      'c3000000-0000-4000-8000-000000000001',
      'c6000000-0000-4000-8000-000000000005'
    )$$,
  'P0001',
  'CONTROL_NOT_AVAILABLE',
  'another teacher receives the neutral launch denial'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.launch_cohort_quest(
      'c3000000-0000-4000-8000-000000000001',
      'c6000000-0000-4000-8000-000000000006'
    )$$,
  'P0001',
  'CONTROL_NOT_AVAILABLE',
  'students cannot launch the cohort'
);

select * from finish();
rollback;
