import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbContainer = process.env.TEST_SUPABASE_DB_CONTAINER ??
  "supabase_db_future-ready-campus-quest";
const resetSql = readFileSync(
  resolve(import.meta.dirname, "../reset/production-disposable-reset.sql"),
  "utf8",
);

function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function line(output: string, prefix: string): string {
  const match = output.split("\n").find((candidate) =>
    candidate.startsWith(prefix)
  );
  if (!match) throw new Error(`Missing integration evidence: ${prefix}`);
  return match.slice(prefix.length);
}

const seedApprovedGraph = `
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reset-owner@example.invalid', '',
    now(),
    '{"role":"teacher","bootstrapAuthorizationId":"course-owner-2026-08-08"}',
    '{}', now(), now()
  ),
  (
    'c2000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reset-student@example.invalid', '',
    now(), '{"role":"student"}', '{}', now(), now()
  );

insert into public.user_roles (user_id, role)
values
  ('c1000000-0000-4000-8000-000000000001', 'teacher'),
  ('c2000000-0000-4000-8000-000000000001', 'student');

insert into public.cohorts (
  id, teacher_id, title, group_count, group_capacity
)
values
  (
    'c3000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'Production Classroom', 5, 6
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    'Disposable Setup Classroom', 9, 6
  );

insert into public.student_private_profiles (
  student_id, cohort_id, group_id, real_name
)
select
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000002', groups.id,
  'Disposable Student'
from public.groups as groups
where groups.cohort_id = 'c3000000-0000-4000-8000-000000000002'
  and groups.group_number = 1;

insert into public.student_public_profiles (
  student_id, cohort_id, group_id, nickname
)
select student_id, cohort_id, group_id, 'Explorer 1'
from public.student_private_profiles
where student_id = 'c2000000-0000-4000-8000-000000000001';

update public.groups
set display_name = 'Approved identity residue',
    identity_editor_id = 'c2000000-0000-4000-8000-000000000001',
    identity_locked_at = now(),
    image_object_path = 'group-images/approved-residue.png'
where cohort_id = 'c3000000-0000-4000-8000-000000000001'
  and group_number = 1;

insert into private.group_identity_receipts (
  actor_user_id, request_key, input_payload, group_id,
  group_number, display_name, image_object_path, locked_at
)
select
  'c2000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000001',
  '{"action":"rename","untrusted":"not-read-by-reset"}',
  groups.id, groups.group_number, groups.display_name,
  groups.image_object_path, groups.identity_locked_at
from public.groups as groups
where groups.cohort_id = 'c3000000-0000-4000-8000-000000000001'
  and groups.group_number = 1;

insert into public.cohort_join_windows (
  id, cohort_id, token_hash, request_key, opens_at,
  expires_at, closed_at, created_by
)
values
  ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', repeat('a', 64), 'c5000000-0000-4000-8000-000000000001', now() - interval '1 minute', now() + interval '9 minutes', now(), 'c1000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', repeat('b', 64), 'c5000000-0000-4000-8000-000000000002', now() - interval '1 minute', now() + interval '9 minutes', now(), 'c1000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000003', 'c3000000-0000-4000-8000-000000000001', repeat('c', 64), 'c5000000-0000-4000-8000-000000000003', now() - interval '1 minute', now() + interval '9 minutes', now(), 'c1000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000002', repeat('d', 64), 'c5000000-0000-4000-8000-000000000004', now() - interval '1 minute', now() + interval '9 minutes', now(), 'c1000000-0000-4000-8000-000000000001');

insert into public.cohort_group_join_codes (
  join_window_id, cohort_id, group_id, code_hash
)
select windows.id, windows.cohort_id, groups.id,
  encode(extensions.digest(windows.id::text || groups.id::text, 'sha256'), 'hex')
from public.cohort_join_windows as windows
join public.groups as groups on groups.cohort_id = windows.cohort_id;

insert into public.student_join_requests (
  join_window_id, request_key, student_id, cohort_id, group_id
)
select
  'c4000000-0000-4000-8000-000000000004',
  'c7000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  private_profiles.cohort_id, private_profiles.group_id
from public.student_private_profiles as private_profiles
where private_profiles.student_id = 'c2000000-0000-4000-8000-000000000001';

insert into public.audit_events (
  actor_user_id, cohort_id, event_type, request_key
)
select
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000002',
  'reset.approved.' || item::text,
  extensions.uuid_generate_v4()
from generate_series(1, 7) as item;

insert into private.join_attempts (token_hash, rate_key_hash)
values (repeat('e', 64), repeat('f', 64));

insert into auth.sessions (id, user_id, created_at, updated_at)
values ('c8000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', now(), now());
`;

it("executes the exact atomic reset against the pre-August-10 schema boundary", () => {
  const output = psql(`
begin;
drop table if exists private.student_login_attempts cascade;
drop table if exists private.student_login_credentials cascade;
alter table public.cohorts drop column if exists student_access_id cascade;

${seedApprovedGraph}

insert into public.audit_events (
  actor_user_id, cohort_id, event_type, request_key
)
values (
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000002',
  'reset.mismatch',
  'c9000000-0000-4000-8000-000000000001'
);

savepoint before_mismatched_reset;
\\set ON_ERROR_STOP off
${resetSql}
\\set reset_mismatch_state :SQLSTATE
rollback to savepoint before_mismatched_reset;
\\set ON_ERROR_STOP on

select 'RESET_MISMATCH_STATE=' || :'reset_mismatch_state';
select 'RESET_ROLLBACK_COUNTS=' || concat_ws(',',
  (select count(*) from auth.users),
  (select count(*) from public.cohorts),
  (select count(*) from public.cohort_join_windows),
  (select count(*) from public.cohort_group_join_codes),
  (select count(*) from public.audit_events),
  (select count(*) from private.group_identity_receipts)
);

delete from public.audit_events where event_type = 'reset.mismatch';

${resetSql}

select 'RESET_FINAL=' || jsonb_build_object(
  'authUsers', (select count(*) from auth.users),
  'roles', (select count(*) from public.user_roles),
  'cohorts', (select count(*) from public.cohorts),
  'cohortExact', (select count(*) = 1 from public.cohorts where title = 'Production Classroom' and group_count = 5 and group_capacity = 6 and archived_at is null),
  'groups', (select count(*) from public.groups),
  'groupNumbers', (select array_agg(group_number order by group_number) from public.groups),
  'canonicalGroups', (select count(*) from public.groups where display_name = 'Group ' || group_number::text and identity_editor_id is null and identity_locked_at is null and image_object_path is null),
  'privateProfiles', (select count(*) from public.student_private_profiles),
  'publicProfiles', (select count(*) from public.student_public_profiles),
  'sessions', (select count(*) from auth.sessions),
  'joinWindows', (select count(*) from public.cohort_join_windows),
  'joinCodes', (select count(*) from public.cohort_group_join_codes),
  'joinRequests', (select count(*) from public.student_join_requests),
  'auditEvents', (select count(*) from public.audit_events),
  'joinAttempts', (select count(*) from private.join_attempts),
  'identityReceipts', (select count(*) from private.group_identity_receipts),
  'learningRows', (select
      (select count(*) from public.quest_attempts)
      + (select count(*) from public.phase_progress)
      + (select count(*) from public.student_responses)
      + (select count(*) from public.concept_evidence)
      + (select count(*) from public.attempt_items)
      + (select count(*) from public.quest_reflections)
      + (select count(*) from public.quest_results)
      + (select count(*) from public.team_score_snapshots)),
  'otherTransientRows', (select
      (select count(*) from public.cohort_session_controls)
      + (select count(*) from private.session_recovery_tokens)
      + (select count(*) from private.group_media_assets)
      + (select count(*) from public.cohort_quest_launches)
      + (select count(*) from private.cohort_quest_launch_receipts)
      + (select count(*) from private.teacher_control_audit)
      + (select count(*) from private.teacher_roster_control_receipts)
      + (select count(*) from storage.objects where bucket_id = 'group-images')),
  'loginTablesAbsent', to_regclass('private.student_login_credentials') is null
    and to_regclass('private.student_login_attempts') is null
)::text;
rollback;
`);

  expect(line(output, "RESET_MISMATCH_STATE=")).toBe("P0001");
  expect(line(output, "RESET_ROLLBACK_COUNTS=")).toBe("2,2,4,24,8,1");
  expect(JSON.parse(line(output, "RESET_FINAL="))).toEqual({
    authUsers: 1,
    roles: 1,
    cohorts: 1,
    cohortExact: true,
    groups: 5,
    groupNumbers: [1, 2, 3, 4, 5],
    canonicalGroups: 5,
    privateProfiles: 0,
    publicProfiles: 0,
    sessions: 0,
    joinWindows: 0,
    joinCodes: 0,
    joinRequests: 0,
    auditEvents: 0,
    joinAttempts: 0,
    identityReceipts: 0,
    learningRows: 0,
    otherTransientRows: 0,
    loginTablesAbsent: true,
  });
});
