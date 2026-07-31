begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

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
