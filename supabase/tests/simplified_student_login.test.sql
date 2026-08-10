begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

select has_column(
  'public',
  'cohorts',
  'student_access_id',
  'classes expose a stable opaque student access id'
);

select has_table(
  'private',
  'student_login_credentials',
  'student credentials have dedicated private storage'
);

select has_table(
  'private',
  'student_login_attempts',
  'returning login attempts have a private rate ledger'
);

select has_function(
  'public',
  'complete_student_code_join',
  array[
    'text', 'uuid', 'uuid', 'text', 'uuid',
    'text', 'text', 'text', 'integer', 'boolean'
  ],
  'the trusted join completion accepts class scope and credential material'
);

select has_function(
  'public',
  'begin_student_login',
  array['uuid', 'text', 'text', 'uuid'],
  'the trusted returning-login preparation RPC exists'
);

select has_function(
  'public',
  'finish_student_login',
  array['uuid', 'uuid', 'boolean'],
  'the trusted returning-login finalization RPC exists'
);

select has_function(
  'public',
  'load_student_login_identity',
  array['uuid'],
  'the narrow returning-login identity RPC exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'login-owner@example.invalid', '',
    now(), '{"role":"teacher"}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000011',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'login-student-1@example.invalid', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000012',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'login-student-2@example.invalid', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000013',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'login-student-3@example.invalid', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000014',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'login-student-4@example.invalid', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000015',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'login-student-5@example.invalid', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000016',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'closed-join-student@example.invalid', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000017',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'legacy-replay-student@example.invalid', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '30000000-0000-4000-8000-000000000021',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'other-class-student@example.invalid', '',
    now(), '{}', '{}', now(), now()
  );

insert into public.user_roles (user_id, role)
values ('30000000-0000-4000-8000-000000000001', 'teacher');

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity, student_access_id
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Simplified login classroom',
    2,
    20,
    '40000000-0000-4000-8000-000000000002'
  ),
  (
    '40000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-000000000001',
    'Other login classroom',
    1,
    20,
    '40000000-0000-4000-8000-000000000011'
  );

select isnt(student_access_id, null, 'a class receives an opaque student access id')
from public.cohorts where id = '40000000-0000-4000-8000-000000000001';

insert into public.cohort_join_windows (
  id, cohort_id, token_hash, request_key, expires_at, created_by
)
values (
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  repeat('f', 64),
  '50000000-0000-4000-8000-000000000001',
  now() + interval '15 minutes',
  '30000000-0000-4000-8000-000000000001'
);

insert into public.cohort_group_join_codes (
  cohort_id, join_window_id, group_id, code_hash
)
select
  '40000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  groups.id,
  case groups.group_number when 1 then repeat('1', 64) else repeat('2', 64) end
from public.groups as groups
where groups.cohort_id = '40000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from public.begin_student_login(
    '40000000-0000-4000-8000-000000000099', repeat('a', 64), repeat('b', 64),
    '50000000-0000-4000-8000-000000000001'
  ) $$,
  'P0001', 'STUDENT_LOGIN_NOT_ACCEPTED',
  'unknown class access is neutral'
);

select is(
  has_table_privilege('anon', 'private.student_login_credentials', 'select'),
  false,
  'anonymous users cannot read private student credentials'
);

select is(
  has_table_privilege(
    'authenticated', 'private.student_login_credentials', 'select'
  ),
  false,
  'authenticated users cannot read private student credentials'
);

select ok(
  not has_table_privilege('anon', 'private.student_login_attempts', 'select')
  and not has_table_privilege(
    'authenticated', 'private.student_login_attempts', 'select'
  ),
  'browser users cannot read the private login rate ledger'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.begin_student_login(uuid,text,text,uuid)',
    'execute'
  ),
  false,
  'authenticated browser users cannot call the service-role login preparation RPC'
);

select ok(
  not has_function_privilege(
    'anon', 'public.finish_student_login(uuid,uuid,boolean)', 'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.finish_student_login(uuid,uuid,boolean)', 'execute'
  ),
  'browser users cannot finalize private login attempts'
);

select ok(
  not has_function_privilege(
    'anon', 'public.load_student_login_identity(uuid)', 'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.load_student_login_identity(uuid)', 'execute'
  ),
  'browser users cannot load returning-login identity rows'
);

select ok(
  has_function_privilege(
    'service_role', 'public.begin_student_login(uuid,text,text,uuid)', 'execute'
  )
  and has_function_privilege(
    'service_role', 'public.finish_student_login(uuid,uuid,boolean)', 'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_student_code_join(text,uuid,uuid,text,uuid,text,text,text,integer,boolean)',
    'execute'
  ),
  'only the trusted service boundary receives the new login and join RPCs'
);

select ok(
  has_function_privilege(
    'service_role', 'public.load_student_login_identity(uuid)', 'execute'
  )
  and not has_table_privilege(
    'service_role', 'public.student_private_profiles', 'select'
  )
  and not has_table_privilege(
    'service_role', 'public.student_public_profiles', 'select'
  )
  and not has_table_privilege('service_role', 'public.groups', 'select'),
  'the service role gets only the narrow identity RPC, not broad profile reads'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.complete_student_code_join(text,uuid,uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.complete_student_join(text,uuid,uuid,smallint,text,text)',
    'execute'
  ),
  'legacy completion boundaries cannot create post-migration students'
);

select throws_ok(
  $$ select * from public.complete_student_code_join(
    repeat('1', 64),
    '50000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    'Scoped Student',
    '40000000-0000-4000-8000-000000000099',
    repeat('c', 64), 'salt-1', 'hash-1', 210000, true
  ) $$,
  'P0001', 'INVALID_JOIN_CODE',
  'a group code cannot enroll a student through a different class scope'
);

select is(
  (
    select count(*) from public.student_private_profiles
    where student_id = '30000000-0000-4000-8000-000000000011'
  ),
  0::bigint,
  'class scope is validated before profile creation'
);

select lives_ok(
  $$ select * from public.complete_student_code_join(
    repeat('2', 64),
    '50000000-0000-4000-8000-000000000012',
    '30000000-0000-4000-8000-000000000011',
    'Ordinary Student',
    '40000000-0000-4000-8000-000000000002',
    repeat('c', 64), 'salt-1', 'hash-1', 210000, false
  ) $$,
  'a student can join without requesting leadership'
);

select is(
  (
    select identity_editor_id from public.groups
    where cohort_id = '40000000-0000-4000-8000-000000000001'
      and group_number = 2
  ),
  null::uuid,
  'p_wants_leader false never claims an empty group'
);

select lives_ok(
  $$ select * from public.complete_student_code_join(
    repeat('1', 64),
    '50000000-0000-4000-8000-000000000013',
    '30000000-0000-4000-8000-000000000012',
    'First Leader',
    '40000000-0000-4000-8000-000000000002',
    repeat('c', 64), 'salt-2', 'hash-2', 210000, true
  ) $$,
  'the first student can request group leadership'
);

select lives_ok(
  $$ select * from public.complete_student_code_join(
    repeat('1', 64),
    '50000000-0000-4000-8000-000000000014',
    '30000000-0000-4000-8000-000000000013',
    'Later Leader',
    '40000000-0000-4000-8000-000000000002',
    repeat('c', 64), 'salt-3', 'hash-3', 210000, true
  ) $$,
  'a later leadership request does not block enrollment'
);

select is(
  (
    select identity_editor_id from public.groups
    where cohort_id = '40000000-0000-4000-8000-000000000001'
      and group_number = 1
  ),
  '30000000-0000-4000-8000-000000000012'::uuid,
  'the first successful leader claim wins atomically'
);

select is(
  (
    select count(*) from public.groups
    where cohort_id = '40000000-0000-4000-8000-000000000001'
      and identity_editor_id is not null
  ),
  1::bigint,
  'the class has exactly one claimed leader among the exercised groups'
);

select lives_ok(
  $$ select * from public.complete_student_code_join(
    repeat('2', 64),
    '50000000-0000-4000-8000-000000000015',
    '30000000-0000-4000-8000-000000000014',
    'Duplicate Name Four',
    '40000000-0000-4000-8000-000000000002',
    repeat('c', 64), 'salt-4', 'hash-4', 210000, false
  ) $$,
  'a fourth duplicate name credential can be stored'
);

select throws_ok(
  $$ select * from public.complete_student_code_join(
    repeat('2', 64),
    '50000000-0000-4000-8000-000000000016',
    '30000000-0000-4000-8000-000000000015',
    'Duplicate Name Five',
    '40000000-0000-4000-8000-000000000002',
    repeat('c', 64), 'salt-5', 'hash-5', 210000, false
  ) $$,
  'P0001', 'STUDENT_NAME_NOT_AVAILABLE',
  'a fifth active credential for one class and normalized name is rejected'
);

select ok(
  not exists (
    select 1 from public.student_private_profiles
    where student_id = '30000000-0000-4000-8000-000000000015'
  )
  and not exists (
    select 1 from private.student_login_credentials
    where student_id = '30000000-0000-4000-8000-000000000015'
  ),
  'the rejected fifth duplicate leaves no partial profile or credential'
);

select is(
  (
    select count(*) from private.student_login_credentials
    where cohort_id = '40000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'credential insertion is atomic with successful profile creation'
);

select results_eq(
  $$ select passcode_salt, passcode_hash, passcode_iterations
     from private.student_login_credentials
     where student_id = '30000000-0000-4000-8000-000000000012' $$,
  $$ values ('salt-2'::text, 'hash-2'::text, 210000) $$,
  'the trusted join stores only supplied PBKDF2 credential material'
);

select lives_ok(
  $$ select * from public.complete_student_code_join(
    repeat('1', 64),
    '50000000-0000-4000-8000-000000000013',
    '30000000-0000-4000-8000-000000000099',
    'Replay Must Not Replace',
    '40000000-0000-4000-8000-000000000002',
    repeat('d', 64), 'replacement-salt', 'replacement-hash', 210000, false
  ) $$,
  'a completed extended join remains idempotently replayable'
);

select results_eq(
  $$ select name_lookup_hash, passcode_hash
     from private.student_login_credentials
     where student_id = '30000000-0000-4000-8000-000000000012' $$,
  $$ values (repeat('c', 64), 'hash-2'::text) $$,
  'a replay cannot replace the original private credential'
);

do $block$
begin
  perform *
  from public.complete_student_code_join(
    repeat('2', 64),
    '50000000-0000-4000-8000-000000000017',
    '30000000-0000-4000-8000-000000000017',
    'Pre-migration Student'
  );
end
$block$;

select throws_ok(
  $$ select * from public.complete_student_code_join(
    repeat('2', 64),
    '50000000-0000-4000-8000-000000000017',
    '30000000-0000-4000-8000-000000000017',
    'Pre-migration Student',
    '40000000-0000-4000-8000-000000000002',
    repeat('d', 64), 'legacy-salt', 'legacy-hash', 210000, false
  ) $$,
  'P0001', 'STUDENT_RECOVERY_REQUIRED',
  'an extended replay cannot attach credentials to a pre-migration student'
);

select ok(
  exists (
    select 1 from public.student_private_profiles
    where student_id = '30000000-0000-4000-8000-000000000017'
  )
  and not exists (
    select 1 from private.student_login_credentials
    where student_id = '30000000-0000-4000-8000-000000000017'
  ),
  'a credentialless replay remains on the teacher-issued recovery path'
);

insert into public.user_roles (user_id, role)
values ('30000000-0000-4000-8000-000000000021', 'student');

insert into public.student_private_profiles (
  student_id, cohort_id, group_id, real_name
)
select
  '30000000-0000-4000-8000-000000000021',
  '40000000-0000-4000-8000-000000000010',
  groups.id,
  'Other Class Duplicate'
from public.groups as groups
where groups.cohort_id = '40000000-0000-4000-8000-000000000010';

insert into public.student_public_profiles (
  student_id, cohort_id, group_id, nickname
)
select
  '30000000-0000-4000-8000-000000000021',
  '40000000-0000-4000-8000-000000000010',
  groups.id,
  'Other Explorer'
from public.groups as groups
where groups.cohort_id = '40000000-0000-4000-8000-000000000010';

insert into private.student_login_credentials (
  student_id, cohort_id, name_lookup_hash,
  passcode_salt, passcode_hash, passcode_iterations
)
values (
  '30000000-0000-4000-8000-000000000021',
  '40000000-0000-4000-8000-000000000010',
  repeat('c', 64), 'other-salt', 'other-hash', 210000
);

select is(
  (
    select count(*)
    from public.begin_student_login(
      '40000000-0000-4000-8000-000000000002',
      repeat('c', 64), repeat('7', 64),
      '50000000-0000-4000-8000-000000000021'
    ) as candidates
    where candidates.student_id is not null
  ),
  4::bigint,
  'login returns at most four active candidates from the requested class'
);

select is_empty(
  $$ select student_id
     from public.begin_student_login(
       '40000000-0000-4000-8000-000000000002',
       repeat('c', 64), repeat('8', 64),
       '50000000-0000-4000-8000-000000000022'
     )
     where student_id = '30000000-0000-4000-8000-000000000021' $$,
  'credential candidates never cross class scope'
);

select throws_ok(
  $$ select public.finish_student_login(
    (
      select attempt_id
      from public.begin_student_login(
        '40000000-0000-4000-8000-000000000002',
        repeat('c', 64), repeat('9', 64),
        '50000000-0000-4000-8000-000000000023'
      ) limit 1
    ),
    '30000000-0000-4000-8000-000000000021',
    true
  ) $$,
  'P0001', 'STUDENT_LOGIN_NOT_ACCEPTED',
  'successful finalization rejects a student credential from another class'
);

select lives_ok(
  $$ select public.finish_student_login(
    (
      select attempt_id
      from public.begin_student_login(
        '40000000-0000-4000-8000-000000000002',
        repeat('c', 64), repeat('a', 64),
        '50000000-0000-4000-8000-000000000024'
      ) limit 1
    ),
    '30000000-0000-4000-8000-000000000012',
    true
  ) $$,
  'a matching active student can successfully finalize exactly one attempt'
);

select throws_ok(
  $$ select public.finish_student_login(
    (
      select attempt_id
      from public.begin_student_login(
        '40000000-0000-4000-8000-000000000002',
        repeat('6', 64), repeat('5', 64),
        '50000000-0000-4000-8000-000000000029'
      ) limit 1
    ),
    null,
    null
  ) $$,
  'P0001', 'STUDENT_LOGIN_NOT_ACCEPTED',
  'a nullable outcome cannot finalize outside the failure ledger'
);

update public.cohort_join_windows
set closed_at = now()
where id = '41000000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)
    from public.begin_student_login(
      '40000000-0000-4000-8000-000000000002',
      repeat('c', 64), repeat('b', 64),
      '50000000-0000-4000-8000-000000000025'
    ) as candidates
    where candidates.student_id is not null
  ),
  4::bigint,
  'closing joining does not block returning login preparation'
);

select throws_ok(
  $$ select * from public.complete_student_code_join(
    repeat('2', 64),
    '50000000-0000-4000-8000-000000000026',
    '30000000-0000-4000-8000-000000000016',
    'Closed Join Student',
    '40000000-0000-4000-8000-000000000002',
    repeat('e', 64), 'closed-salt', 'closed-hash', 210000, false
  ) $$,
  'P0001', 'GROUP_JOIN_CLOSED',
  'closing joining still blocks new enrollment'
);

select lives_ok(
  $$ do $block$
     declare
       v_attempt_id uuid;
     begin
       for attempt_number in 1..5 loop
         select attempt_id into v_attempt_id
         from public.begin_student_login(
           '40000000-0000-4000-8000-000000000002',
           repeat('d', 64), repeat('c', 64),
           ('51000000-0000-4000-8000-' || lpad(attempt_number::text, 12, '0'))::uuid
         ) limit 1;
         perform public.finish_student_login(v_attempt_id, null, false);
       end loop;
     end
     $block$ $$,
  'five failed class-and-name-scoped attempts are finalized'
);

select throws_ok(
  $$ select * from public.begin_student_login(
    '40000000-0000-4000-8000-000000000002',
    repeat('d', 64), repeat('d', 64),
    '50000000-0000-4000-8000-000000000027'
  ) $$,
  'P0001', 'STUDENT_LOGIN_NOT_ACCEPTED',
  'five failures put the sixth class-and-name-scoped attempt into cooldown'
);

select lives_ok(
  $$ do $block$
     begin
       for attempt_number in 1..90 loop
         perform * from public.begin_student_login(
           '40000000-0000-4000-8000-000000000011',
           repeat('e', 64), repeat('f', 64),
           ('52000000-0000-4000-8000-' || lpad(attempt_number::text, 12, '0'))::uuid
         );
       end loop;
     end
     $block$ $$,
  'one shared network retains a 90-attempt-per-minute classroom allowance'
);

select throws_ok(
  $$ select * from public.begin_student_login(
    '40000000-0000-4000-8000-000000000011',
    repeat('e', 64), repeat('f', 64),
    '50000000-0000-4000-8000-000000000028'
  ) $$,
  'P0001', 'LOGIN_NOT_AVAILABLE',
  'the 91st shared-network login attempt is rate limited'
);

select results_eq(
  $$ select student_id, cohort_id, group_number, nickname
     from public.load_student_login_identity(
       '30000000-0000-4000-8000-000000000012'
     ) $$,
  $$ values (
       '30000000-0000-4000-8000-000000000012'::uuid,
       '40000000-0000-4000-8000-000000000001'::uuid,
       1::smallint,
       'Explorer 1'::text
     ) $$,
  'the trusted identity RPC returns one active student in its own class'
);

select results_eq(
  $$ select student_id, is_group_identity_editor
     from public.load_student_login_identity(
       '30000000-0000-4000-8000-000000000021'
     ) $$,
  $$ values (
       '30000000-0000-4000-8000-000000000021'::uuid,
       false
     ) $$,
  'the trusted identity RPC returns false when the group has no leader'
);

update public.student_private_profiles
set removed_at = now()
where student_id = '30000000-0000-4000-8000-000000000012';

select is_empty(
  $$ select * from public.load_student_login_identity(
       '30000000-0000-4000-8000-000000000012'
     ) $$,
  'the trusted identity RPC excludes removed students'
);

update public.student_private_profiles
set removed_at = null
where student_id = '30000000-0000-4000-8000-000000000012';

update public.student_public_profiles
set cohort_id = '40000000-0000-4000-8000-000000000010',
    group_id = (
      select id from public.groups
      where cohort_id = '40000000-0000-4000-8000-000000000010'
    )
where student_id = '30000000-0000-4000-8000-000000000012';

select is_empty(
  $$ select * from public.load_student_login_identity(
       '30000000-0000-4000-8000-000000000012'
     ) $$,
  'the trusted identity RPC rejects cross-class profile mismatches'
);

update public.student_public_profiles
set cohort_id = '40000000-0000-4000-8000-000000000001',
    group_id = (
      select id from public.groups
      where cohort_id = '40000000-0000-4000-8000-000000000001'
        and group_number = 1
    )
where student_id = '30000000-0000-4000-8000-000000000012';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    public.get_teacher_classroom_readiness(
      '40000000-0000-4000-8000-000000000001'
    ) #>> '{groups,0,students,0,isGroupLeader}'
  )::boolean,
  true,
  'teacher readiness marks the current group leader on every roster shape'
);

select * from finish();

rollback;
