begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  'd1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'nat-load-owner@example.invalid',
  '',
  now(),
  '{"role":"teacher"}',
  '{}',
  now(),
  now()
);

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity
)
values (
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'Shared network join test',
  5,
  6
);

insert into public.cohort_join_windows (
  id, cohort_id, token_hash, request_key, expires_at, created_by
)
values (
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'd5000000-0000-4000-8000-000000000001',
  now() + interval '15 minutes',
  'd1000000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$
    do $block$
    begin
      for attempt_number in 1..45 loop
        perform public.preflight_student_join(
          repeat('a', 64),
          1::smallint,
          repeat('b', 64)
        );
      end loop;
    end;
    $block$;
  $$,
  'one shared classroom network can admit a 30-student burst with headroom'
);

select is(
  (select count(*) from private.join_attempts),
  45::bigint,
  'all 45 permitted shared-network attempts are recorded'
);

select throws_ok(
  $$
    select public.preflight_student_join(
      repeat('a', 64),
      1::smallint,
      repeat('b', 64)
    )
  $$,
  'P0001',
  'JOIN_NOT_AVAILABLE',
  'the 46th shared-network attempt is rejected within one minute'
);

select * from finish();

rollback;
