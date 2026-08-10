begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_function(
  'public',
  'open_cohort_join_window_with_codes',
  array['uuid', 'text', 'timestamptz', 'uuid', 'jsonb'],
  'join-window creation and group-code persistence share one transaction'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  'fa100000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'class-setup-owner@example.invalid', '',
  now(), '{"role":"teacher"}', '{}', now(), now()
);

insert into public.user_roles (user_id, role)
values ('fa100000-0000-4000-8000-000000000001', 'teacher');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'fa100000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    public.create_teacher_cohort(
      'Direct RPC class', 2::smallint, 3::smallint,
      'fa200000-0000-4000-8000-000000000001'
    )
  ).group_capacity,
  20::smallint,
  'the compatible direct create RPC cannot override fixed capacity 20'
);

select is(
  (
    public.create_teacher_cohort(
      'Ignored replay title', 2::smallint, 1::smallint,
      'fa200000-0000-4000-8000-000000000001'
    )
  ).group_capacity,
  20::smallint,
  'a create replay converges on the original fixed-capacity class'
);

select is(
  (
    select count(*)::integer
    from public.cohorts
    where creation_request_key = 'fa200000-0000-4000-8000-000000000001'
  ),
  1,
  'a repeated create request key cannot duplicate the class'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.open_cohort_join_window(uuid,text,timestamptz,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.configure_cohort_group_join_codes(uuid,uuid,jsonb)',
    'execute'
  ),
  'browser callers cannot split the atomic join-window operation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.open_cohort_join_window_with_codes(uuid,text,timestamptz,uuid,jsonb)',
    'execute'
  ),
  'authenticated teachers can invoke only the atomic open boundary'
);

select throws_ok(
  $$select public.open_cohort_join_window_with_codes(
      (select id from public.cohorts
       where creation_request_key = 'fa200000-0000-4000-8000-000000000001'),
      repeat('a', 64),
      now() + interval '10 minutes',
      'fa300000-0000-4000-8000-000000000001',
      '[]'::jsonb
    )$$,
  '22023',
  'INVALID_GROUP_CODES',
  'invalid group-code preparation rejects the entire open transaction'
);

reset role;

select is(
  (
    select count(*)::integer from public.cohort_join_windows
    where request_key = 'fa300000-0000-4000-8000-000000000001'
  ),
  0,
  'a failed atomic open leaves no committed join window'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'fa100000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  format(
    $$select public.open_cohort_join_window_with_codes(
      (select id from public.cohorts
       where creation_request_key = 'fa200000-0000-4000-8000-000000000001'),
      repeat('a', 64),
      now() + interval '10 minutes',
      'fa300000-0000-4000-8000-000000000001',
      %L::jsonb
    )$$,
    (
      select jsonb_agg(jsonb_build_object(
        'groupId', id,
        'codeHash', repeat(group_number::text, 64)
      ) order by group_number)::text
      from public.groups
      where cohort_id = (
        select id from public.cohorts
        where creation_request_key = 'fa200000-0000-4000-8000-000000000001'
      )
    )
  ),
  'a prepared join window and all group codes commit together'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.cohort_group_join_codes as codes
    join public.cohort_join_windows as windows
      on windows.id = codes.join_window_id
    where windows.request_key = 'fa300000-0000-4000-8000-000000000001'
  ),
  2,
  'the committed window contains one code for every group'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'fa100000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  format(
    $$select public.open_cohort_join_window_with_codes(
      (select id from public.cohorts
       where creation_request_key = 'fa200000-0000-4000-8000-000000000001'),
      repeat('a', 64),
      now() + interval '5 minutes',
      'fa300000-0000-4000-8000-000000000001',
      %L::jsonb
    )$$,
    (
      select jsonb_agg(jsonb_build_object(
        'groupId', id,
        'codeHash', repeat(group_number::text, 64)
      ) order by group_number)::text
      from public.groups
      where cohort_id = (
        select id from public.cohorts
        where creation_request_key = 'fa200000-0000-4000-8000-000000000001'
      )
    )
  ),
  'an ambiguous retry with the same key converges on the committed window'
);

reset role;

select is(
  (
    select count(*)::integer from public.cohort_join_windows
    where request_key = 'fa300000-0000-4000-8000-000000000001'
  ),
  1,
  'an ambiguous open retry cannot duplicate the window'
);

select * from finish();

rollback;
