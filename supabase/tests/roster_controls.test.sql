begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select has_column(
  'public',
  'student_private_profiles',
  'removed_at',
  'student removal is represented as retained, inactive membership'
);

select has_function(
  'public',
  'manage_teacher_roster',
  array['uuid', 'text', 'uuid', 'uuid', 'uuid'],
  'roster mutations use one teacher-owned atomic RPC'
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
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'roster-owner@example.invalid', '{"role":"teacher"}'),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 'roster-other@example.invalid', '{"role":"teacher"}'),
    ('a2000000-0000-4000-8000-000000000001'::uuid, 'roster-student-1@example.invalid', '{"role":"student"}'),
    ('a2000000-0000-4000-8000-000000000002'::uuid, 'roster-student-2@example.invalid', '{"role":"student"}'),
    ('a2000000-0000-4000-8000-000000000003'::uuid, 'roster-student-3@example.invalid', '{"role":"student"}'),
    ('a2000000-0000-4000-8000-000000000004'::uuid, 'roster-student-4@example.invalid', '{"role":"student"}'),
    ('a2000000-0000-4000-8000-000000000005'::uuid, 'roster-student-5@example.invalid', '{"role":"student"}')
) as users(id, email, metadata);

insert into public.user_roles (user_id, role)
select id, role::public.app_role
from (
  values
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'teacher'),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 'teacher'),
    ('a2000000-0000-4000-8000-000000000001'::uuid, 'student'),
    ('a2000000-0000-4000-8000-000000000002'::uuid, 'student'),
    ('a2000000-0000-4000-8000-000000000003'::uuid, 'student'),
    ('a2000000-0000-4000-8000-000000000004'::uuid, 'student'),
    ('a2000000-0000-4000-8000-000000000005'::uuid, 'student')
) as roles(id, role);

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity
)
values (
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Roster controls classroom',
  2,
  2
);

insert into public.student_private_profiles (
  student_id, cohort_id, group_id, real_name
)
select
  students.student_id,
  'a3000000-0000-4000-8000-000000000001',
  groups.id,
  students.real_name
from (
  values
    ('a2000000-0000-4000-8000-000000000001'::uuid, 1, 'Roster Student One'),
    ('a2000000-0000-4000-8000-000000000002'::uuid, 1, 'Roster Student Two'),
    ('a2000000-0000-4000-8000-000000000003'::uuid, 2, 'Roster Student Three'),
    ('a2000000-0000-4000-8000-000000000004'::uuid, 2, 'Roster Student Four')
) as students(student_id, group_number, real_name)
join public.groups as groups
  on groups.cohort_id = 'a3000000-0000-4000-8000-000000000001'
  and groups.group_number = students.group_number;

insert into public.student_public_profiles (
  student_id, cohort_id, group_id, nickname
)
select student_id, cohort_id, group_id, 'Explorer ' || row_number() over ()::text
from public.student_private_profiles
where cohort_id = 'a3000000-0000-4000-8000-000000000001';

update public.groups
set identity_editor_id = 'a2000000-0000-4000-8000-000000000001'
where cohort_id = 'a3000000-0000-4000-8000-000000000001'
  and group_number = 1;

update public.groups
set identity_editor_id = 'a2000000-0000-4000-8000-000000000003'
where cohort_id = 'a3000000-0000-4000-8000-000000000001'
  and group_number = 2;

insert into private.group_identity_receipts (
  actor_user_id,
  request_key,
  input_payload,
  group_id,
  group_number,
  display_name,
  image_object_path,
  locked_at
)
select
  'a2000000-0000-4000-8000-000000000003',
  'a6000000-0000-4000-8000-000000000017',
  jsonb_build_object(
    'action', 'transfer-editor',
    'group_id', groups.id,
    'display_name', null,
    'next_editor_id', 'a2000000-0000-4000-8000-000000000004'::uuid
  ),
  groups.id,
  groups.group_number,
  groups.display_name,
  groups.image_object_path,
  groups.identity_locked_at
from public.groups as groups
where groups.cohort_id = 'a3000000-0000-4000-8000-000000000001'
  and groups.group_number = 2;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select * from public.manage_group_identity(
      'rename',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 1),
      'Member rename denied',
      null,
      'a6000000-0000-4000-8000-000000000011'
    )$$,
  '42501',
  'GROUP_ACTION_DENIED',
  'an ordinary member cannot rename the group at the database boundary'
);

select throws_ok(
  $$select * from public.authorize_group_media_upload(
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 1),
      'image/png',
      1024,
      'a6000000-0000-4000-8000-000000000012'
    )$$,
  '42501',
  'MEDIA_ACTION_DENIED',
  'an ordinary member cannot upload group media at the database boundary'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select * from public.manage_group_identity(
      'transfer-editor',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 2),
      null,
      'a2000000-0000-4000-8000-000000000004',
      'a6000000-0000-4000-8000-000000000016'
    )$$,
  '42501',
  'GROUP_ACTION_DENIED',
  'the current group leader cannot transfer leadership at the database boundary'
);

select throws_ok(
  $$select * from public.manage_group_identity(
      'transfer-editor',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 2),
      null,
      'a2000000-0000-4000-8000-000000000004',
      'a6000000-0000-4000-8000-000000000017'
    )$$,
  '42501',
  'GROUP_ACTION_DENIED',
  'a pre-migration student transfer receipt cannot bypass teacher-only authorization'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select group_id from public.manage_group_identity(
      'transfer-editor',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 1),
      null,
      'a2000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000013'
    )),
  (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 1),
  'the teacher can assign an active student in the same group as leader'
);

select is(
  (select identity_editor_id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 1),
  'a2000000-0000-4000-8000-000000000002'::uuid,
  'the group stores exactly one leader after teacher assignment'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_user_id = 'a1000000-0000-4000-8000-000000000001'
      and cohort_id = 'a3000000-0000-4000-8000-000000000001'
      and event_type = 'group_identity.transfer-editor'
      and entity_id = (
        select id from public.groups
        where cohort_id = 'a3000000-0000-4000-8000-000000000001'
          and group_number = 1
      )
  ),
  1,
  'teacher leader assignment is recorded once in the cohort audit'
);

select throws_ok(
  $$select * from public.manage_group_identity(
      'transfer-editor',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 1),
      null,
      'a2000000-0000-4000-8000-000000000003',
      'a6000000-0000-4000-8000-000000000014'
    )$$,
  '22023',
  'GROUP_MEMBER_INVALID',
  'the teacher cannot assign a student from another group as leader'
);

reset role;

insert into content.content_versions (
  id, version_key, payload_digest, item_count, concept_count
)
values (
  'a4000000-0000-4000-8000-000000000001',
  'roster-controls-v1',
  extensions.digest('roster-controls-v1', 'sha256'),
  24,
  8
);

insert into public.quest_attempts (
  id, student_id, cohort_id, content_version_id, current_phase,
  phase_deadline_at
)
values (
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'diagnostic',
  now() + interval '5 minutes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (public.manage_teacher_roster(
    'a3000000-0000-4000-8000-000000000001',
    'remove-student',
    'a2000000-0000-4000-8000-000000000004',
    null,
    'a6000000-0000-4000-8000-000000000001'
  ) ->> 'affected')::integer,
  1,
  'the owner can soft-remove an incorrect roster entry'
);

select throws_ok(
  $$select * from public.manage_group_identity(
      'transfer-editor',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 2),
      null,
      'a2000000-0000-4000-8000-000000000004',
      'a6000000-0000-4000-8000-000000000015'
    )$$,
  '22023',
  'GROUP_MEMBER_INVALID',
  'the teacher cannot assign a removed student as leader'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.student_in_cohort('a3000000-0000-4000-8000-000000000001'),
  false,
  'soft removal immediately revokes cohort membership'
);

select is(
  (select count(*)::integer from public.student_private_profiles where student_id = auth.uid()),
  0,
  'a removed student cannot read even their retained private profile'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (public.manage_teacher_roster(
    'a3000000-0000-4000-8000-000000000001',
    'move-student',
    'a2000000-0000-4000-8000-000000000001',
    (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 2),
    'a6000000-0000-4000-8000-000000000002'
  ) ->> 'affected')::integer,
  1,
  'the owner can move a not-started student into a group with capacity'
);

select is(
  (
    select count(*)::integer
    from public.student_private_profiles as private_profiles
    join public.student_public_profiles as public_profiles using (student_id)
    join public.groups as groups on groups.id = private_profiles.group_id
    where private_profiles.student_id = 'a2000000-0000-4000-8000-000000000001'
      and private_profiles.group_id = public_profiles.group_id
      and groups.group_number = 2
  ),
  1,
  'a move atomically updates both private and public membership'
);

reset role;

insert into public.student_private_profiles (
  student_id, cohort_id, group_id, real_name
)
select
  'a2000000-0000-4000-8000-000000000005',
  'a3000000-0000-4000-8000-000000000001',
  id,
  'Roster Student Five'
from public.groups
where cohort_id = 'a3000000-0000-4000-8000-000000000001'
  and group_number = 1;

insert into public.student_public_profiles (
  student_id, cohort_id, group_id, nickname
)
select student_id, cohort_id, group_id, 'Explorer 5'
from public.student_private_profiles
where student_id = 'a2000000-0000-4000-8000-000000000005';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.manage_teacher_roster(
      'a3000000-0000-4000-8000-000000000001',
      'move-student',
      'a2000000-0000-4000-8000-000000000005',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 2),
      'a6000000-0000-4000-8000-000000000003'
    )$$,
  'P0001',
  'GROUP_FULL',
  'the database rejects a move into a full group'
);

select throws_ok(
  $$select public.manage_teacher_roster(
      'a3000000-0000-4000-8000-000000000001',
      'move-student',
      'a2000000-0000-4000-8000-000000000002',
      (select id from public.groups where cohort_id = 'a3000000-0000-4000-8000-000000000001' and group_number = 2),
      'a6000000-0000-4000-8000-000000000004'
    )$$,
  'P0001',
  'STUDENT_ALREADY_STARTED',
  'a student cannot be moved after starting an attempt'
);

select is(
  (public.manage_teacher_roster(
    'a3000000-0000-4000-8000-000000000001',
    'reset-student',
    'a2000000-0000-4000-8000-000000000002',
    null,
    'a6000000-0000-4000-8000-000000000005'
  ) ->> 'affected')::integer,
  1,
  'reset closes the current active attempt'
);

select is(
  (select status from public.quest_attempts where id = 'a5000000-0000-4000-8000-000000000001'),
  'abandoned',
  'the reset attempt is explicitly marked abandoned'
);

select is(
  (select count(*)::integer from public.quest_attempts where student_id = 'a2000000-0000-4000-8000-000000000002'),
  1,
  'reset preserves the complete attempt history'
);

select is(
  (public.manage_teacher_roster(
    'a3000000-0000-4000-8000-000000000001',
    'reset-student',
    'a2000000-0000-4000-8000-000000000002',
    null,
    'a6000000-0000-4000-8000-000000000005'
  ) ->> 'affected')::integer,
  1,
  'replaying the same reset request returns its original receipt'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.manage_teacher_roster(
      'a3000000-0000-4000-8000-000000000001',
      'remove-student',
      'a2000000-0000-4000-8000-000000000001',
      null,
      'a6000000-0000-4000-8000-000000000006'
    )$$,
  'P0001',
  'CONTROL_NOT_AVAILABLE',
  'another teacher receives the neutral control denial'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.manage_teacher_roster(
      'a3000000-0000-4000-8000-000000000001',
      'remove-student',
      'a2000000-0000-4000-8000-000000000001',
      null,
      'a6000000-0000-4000-8000-000000000007'
    )$$,
  'P0001',
  'CONTROL_NOT_AVAILABLE',
  'students cannot invoke roster controls'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.audit_events
    where cohort_id = 'a3000000-0000-4000-8000-000000000001'
      and event_type in ('roster.student_moved', 'roster.student_removed', 'roster.student_reset')
  ),
  3,
  'every applied roster mutation is recorded once in the cohort audit'
);

select * from finish();
rollback;
