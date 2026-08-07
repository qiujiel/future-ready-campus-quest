begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'teacher-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'teacher-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'explorer-one@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'explorer-two@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'explorer-three@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'other-cohort@example.invalid',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values
  ('10000000-0000-0000-0000-000000000001', 'teacher'),
  ('10000000-0000-0000-0000-000000000002', 'teacher'),
  ('20000000-0000-0000-0000-000000000001', 'student'),
  ('20000000-0000-0000-0000-000000000002', 'student'),
  ('20000000-0000-0000-0000-000000000003', 'student'),
  ('30000000-0000-0000-0000-000000000001', 'student');

insert into public.cohorts (id, teacher_id, title, group_count, group_capacity)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Synthetic cohort one',
    2,
    3
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Synthetic cohort two',
    1,
    3
  );

insert into public.student_private_profiles (
  student_id,
  cohort_id,
  group_id,
  real_name
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    (
      select id from public.groups
      where cohort_id = '40000000-0000-0000-0000-000000000001'
        and group_number = 1
    ),
    'Synthetic Learner One'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    (
      select id from public.groups
      where cohort_id = '40000000-0000-0000-0000-000000000001'
        and group_number = 1
    ),
    'Synthetic Learner Two'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000001',
    (
      select id from public.groups
      where cohort_id = '40000000-0000-0000-0000-000000000001'
        and group_number = 2
    ),
    'Synthetic Learner Three'
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    (
      select id from public.groups
      where cohort_id = '40000000-0000-0000-0000-000000000002'
        and group_number = 1
    ),
    'Synthetic Other Cohort'
  );

insert into public.student_public_profiles (
  student_id,
  cohort_id,
  group_id,
  nickname
)
select
  student_id,
  cohort_id,
  group_id,
  case student_id
    when '20000000-0000-0000-0000-000000000001' then 'Explorer One'
    when '20000000-0000-0000-0000-000000000002' then 'Explorer Two'
    when '20000000-0000-0000-0000-000000000003' then 'Explorer Three'
    else 'Other Explorer'
  end
from public.student_private_profiles
where student_id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  $$select count(*)::bigint from public.student_private_profiles$$,
  array[1::bigint],
  'a student can read exactly their own private profile'
);

select is_empty(
  $$select real_name from public.student_private_profiles
    where student_id = '20000000-0000-0000-0000-000000000002'$$,
  'a student cannot read another student real name'
);

select results_eq(
  $$select count(*)::bigint from public.student_public_profiles$$,
  array[2::bigint],
  'a student can read group-visible nicknames only in their own group'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  $$select count(*)::bigint from public.student_private_profiles$$,
  array[3::bigint],
  'a teacher can read all private profiles in an owned cohort'
);

select is_empty(
  $$select real_name from public.student_private_profiles
    where cohort_id = '40000000-0000-0000-0000-000000000002'$$,
  'a teacher cannot read private profiles in another cohort'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select count(*) from public.cohorts$$,
  '42501',
  'permission denied for table cohorts',
  'an anonymous caller cannot read cohorts'
);

select throws_ok(
  $$select count(*) from public.student_private_profiles$$,
  '42501',
  'permission denied for table student_private_profiles',
  'an anonymous caller cannot read private profiles'
);

select * from finish();
rollback;
