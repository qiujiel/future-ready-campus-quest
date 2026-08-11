import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const AUTHORIZATION_ID = "approved-disposable-reset-2026-08-11";
const TEACHER_MARKER = "course-owner-2026-08-08";
const FAILURE_MESSAGE = "Production disposable reset failed";

const FIELDS = Object.freeze({
  markedTeacherCount: "marked_teacher_count",
  otherAuthUserCount: "other_auth_user_count",
  productionClassroomCount: "production_classroom_count",
  otherCohortCount: "other_cohort_count",
  productionClassroomGroupCount: "production_classroom_group_count",
  joinWindowCount: "join_window_count",
  sessionControlCount: "session_control_count",
  openJoiningCount: "open_joining_count",
  openQuestStartCount: "open_quest_start_count",
  cohortGroupJoinCodeCount: "cohort_group_join_code_count",
  auditEventCount: "audit_event_count",
  studentPrivateProfileCount: "student_private_profile_count",
  studentPublicProfileCount: "student_public_profile_count",
  questAttemptCount: "quest_attempt_count",
  phaseProgressCount: "phase_progress_count",
  studentResponseCount: "student_response_count",
  conceptEvidenceCount: "concept_evidence_count",
  attemptItemCount: "attempt_item_count",
  questReflectionCount: "quest_reflection_count",
  questResultCount: "quest_result_count",
  teamScoreSnapshotCount: "team_score_snapshot_count",
  studentJoinRequestCount: "student_join_request_count",
  nonTeacherSessionCount: "non_teacher_session_count",
  joinAttemptCount: "join_attempt_count",
  recoveryAttemptCount: "recovery_attempt_count",
  groupIdentityReceiptCount: "group_identity_receipt_count",
  groupMediaAssetCount: "group_media_asset_count",
  cohortQuestLaunchCount: "cohort_quest_launch_count",
  cohortQuestLaunchReceiptCount: "cohort_quest_launch_receipt_count",
  teacherControlAuditCount: "teacher_control_audit_count",
  teacherRosterControlReceiptCount: "teacher_roster_control_receipt_count",
  groupImageObjectCount: "group_image_object_count",
  studentLoginCredentialsAbsent: "student_login_credentials_absent",
  studentLoginAttemptsAbsent: "student_login_attempts_absent",
});

const APPROVED_BEFORE = Object.freeze({
  marked_teacher_count: 1,
  other_auth_user_count: 1,
  production_classroom_count: 1,
  other_cohort_count: 1,
  production_classroom_group_count: 5,
  join_window_count: 4,
  session_control_count: 0,
  open_joining_count: 0,
  open_quest_start_count: 0,
  cohort_group_join_code_count: 24,
  audit_event_count: 7,
  student_private_profile_count: 1,
  student_public_profile_count: 1,
  quest_attempt_count: 0,
  phase_progress_count: 0,
  student_response_count: 0,
  concept_evidence_count: 0,
  attempt_item_count: 0,
  quest_reflection_count: 0,
  quest_result_count: 0,
  team_score_snapshot_count: 0,
  student_join_request_count: 1,
  non_teacher_session_count: 1,
  join_attempt_count: 1,
  recovery_attempt_count: 0,
  group_identity_receipt_count: 1,
  group_media_asset_count: 0,
  cohort_quest_launch_count: 0,
  cohort_quest_launch_receipt_count: 0,
  teacher_control_audit_count: 0,
  teacher_roster_control_receipt_count: 0,
  group_image_object_count: 0,
  student_login_credentials_absent: true,
  student_login_attempts_absent: true,
});

const CANONICAL_AFTER = Object.freeze({
  ...APPROVED_BEFORE,
  other_auth_user_count: 0,
  other_cohort_count: 0,
  join_window_count: 0,
  cohort_group_join_code_count: 0,
  audit_event_count: 0,
  student_private_profile_count: 0,
  student_public_profile_count: 0,
  student_join_request_count: 0,
  non_teacher_session_count: 0,
  join_attempt_count: 0,
  group_identity_receipt_count: 0,
});

function fail() {
  throw new Error(FAILURE_MESSAGE);
}

function requiredString(value) {
  if (typeof value !== "string" || value.trim().length === 0) fail();
  return value.trim();
}

function aggregateExpression() {
  return `with marked_teachers as (
  select users.id
  from auth.users as users
  where users.raw_app_meta_data ->> 'bootstrapAuthorizationId' = '${TEACHER_MARKER}'
    and users.raw_app_meta_data ->> 'role' = 'teacher'
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = users.id and roles.role = 'teacher'
    )
), production_classrooms as (
  select cohorts.id
  from public.cohorts as cohorts
  join marked_teachers on marked_teachers.id = cohorts.teacher_id
  where cohorts.title = 'Production Classroom'
    and cohorts.group_count = 5
    and cohorts.archived_at is null
)
select jsonb_build_object(
  'marked_teacher_count', (select count(*)::int from marked_teachers),
  'other_auth_user_count', (select count(*)::int from auth.users) - (select count(*)::int from marked_teachers),
  'production_classroom_count', (select count(*)::int from production_classrooms),
  'other_cohort_count', (select count(*)::int from public.cohorts) - (select count(*)::int from production_classrooms),
  'production_classroom_group_count', (select count(*)::int from public.groups where cohort_id in (select id from production_classrooms)),
  'join_window_count', (select count(*)::int from public.cohort_join_windows),
  'session_control_count', (select count(*)::int from public.cohort_session_controls),
  'open_joining_count', (select count(*)::int from public.cohort_join_windows where closed_at is null),
  'open_quest_start_count', (select count(*)::int from public.cohort_session_controls where quest_starts_allowed = true and closed_at is null),
  'cohort_group_join_code_count', (select count(*)::int from public.cohort_group_join_codes),
  'audit_event_count', (select count(*)::int from public.audit_events),
  'student_private_profile_count', (select count(*)::int from public.student_private_profiles),
  'student_public_profile_count', (select count(*)::int from public.student_public_profiles),
  'quest_attempt_count', (select count(*)::int from public.quest_attempts),
  'phase_progress_count', (select count(*)::int from public.phase_progress),
  'student_response_count', (select count(*)::int from public.student_responses),
  'concept_evidence_count', (select count(*)::int from public.concept_evidence),
  'attempt_item_count', (select count(*)::int from public.attempt_items),
  'quest_reflection_count', (select count(*)::int from public.quest_reflections),
  'quest_result_count', (select count(*)::int from public.quest_results),
  'team_score_snapshot_count', (select count(*)::int from public.team_score_snapshots),
  'student_join_request_count', (select count(*)::int from public.student_join_requests),
  'non_teacher_session_count', (select count(*)::int from auth.sessions as sessions where sessions.user_id not in (select id from marked_teachers)),
  'join_attempt_count', (select count(*)::int from private.join_attempts),
  'recovery_attempt_count', (select count(*)::int from private.session_recovery_tokens),
  'group_identity_receipt_count', (select count(*)::int from private.group_identity_receipts),
  'group_media_asset_count', (select count(*)::int from private.group_media_assets),
  'cohort_quest_launch_count', (select count(*)::int from public.cohort_quest_launches),
  'cohort_quest_launch_receipt_count', (select count(*)::int from private.cohort_quest_launch_receipts),
  'teacher_control_audit_count', (select count(*)::int from private.teacher_control_audit),
  'teacher_roster_control_receipt_count', (select count(*)::int from private.teacher_roster_control_receipts),
  'group_image_object_count', (select count(*)::int from storage.objects where bucket_id = 'group-images'),
  'student_login_credentials_absent', to_regclass('private.student_login_credentials') is null,
  'student_login_attempts_absent', to_regclass('private.student_login_attempts') is null
) as aggregate`;
}

const MUTATION_QUERY = `begin;
select pg_advisory_xact_lock(hashtextextended('${AUTHORIZATION_ID}', 0));
lock table auth.users, auth.sessions, public.user_roles, public.cohorts,
  public.groups, public.cohort_join_windows, public.cohort_session_controls,
  public.cohort_group_join_codes, public.audit_events,
  public.student_private_profiles, public.student_public_profiles,
  public.quest_attempts, public.phase_progress, public.student_responses,
  public.concept_evidence, public.attempt_items, public.quest_reflections,
  public.quest_results, public.team_score_snapshots, public.student_join_requests,
  private.join_attempts, private.session_recovery_tokens,
  private.group_identity_receipts, private.group_media_assets,
  public.cohort_quest_launches, private.cohort_quest_launch_receipts,
  private.teacher_control_audit, private.teacher_roster_control_receipts,
  storage.objects in share row exclusive mode;
do $$
declare
  actual jsonb;
begin
  ${aggregateExpression().replace("select jsonb_build_object", "select jsonb_build_object").replace(" as aggregate", " into actual")};
  if actual <> '${JSON.stringify(APPROVED_BEFORE)}'::jsonb then
    raise exception 'reset precondition rejected';
  end if;
end
$$;
delete from public.cohort_group_join_codes;
delete from public.cohort_join_windows;
delete from public.audit_events;
delete from private.join_attempts;
delete from private.group_identity_receipts;
delete from public.cohorts
where id not in (
  select cohorts.id
  from public.cohorts as cohorts
  join auth.users as users on users.id = cohorts.teacher_id
  join public.user_roles as roles on roles.user_id = users.id and roles.role = 'teacher'
  where users.raw_app_meta_data ->> 'bootstrapAuthorizationId' = '${TEACHER_MARKER}'
    and users.raw_app_meta_data ->> 'role' = 'teacher'
    and cohorts.title = 'Production Classroom'
    and cohorts.group_count = 5
    and cohorts.archived_at is null
);
delete from auth.users
where id not in (
  select users.id
  from auth.users as users
  join public.user_roles as roles on roles.user_id = users.id and roles.role = 'teacher'
  where users.raw_app_meta_data ->> 'bootstrapAuthorizationId' = '${TEACHER_MARKER}'
    and users.raw_app_meta_data ->> 'role' = 'teacher'
);
do $$
declare
  actual jsonb;
begin
  ${aggregateExpression().replace(" as aggregate", " into actual")};
  if actual <> '${JSON.stringify(CANONICAL_AFTER)}'::jsonb then
    raise exception 'reset verification rejected';
  end if;
end
$$;
commit;
select true as reset_applied;`;

const VERIFICATION_QUERY = `with snapshot as (
${aggregateExpression()}
)
select
${Object.entries(FIELDS).map(([, field]) =>
  field.endsWith("_absent")
    ? `  (aggregate ->> '${field}')::boolean as ${field}`
    : `  (aggregate ->> '${field}')::int as ${field}`,
).join(",\n")}
from snapshot;`;

function parseAggregate(body) {
  if (!Array.isArray(body) || body.length !== 1 || !body[0] ||
    typeof body[0] !== "object" || Array.isArray(body[0]) ||
    Object.keys(body[0]).length !== Object.keys(FIELDS).length) fail();
  const aggregate = {};
  for (const [name, field] of Object.entries(FIELDS)) {
    if (!Object.hasOwn(body[0], field)) fail();
    const value = body[0][field];
    if (field.endsWith("_absent")) {
      if (typeof value !== "boolean") fail();
    } else if (!Number.isInteger(value) || value < 0) {
      fail();
    }
    aggregate[name] = value;
  }
  return Object.freeze(aggregate);
}

function parseMutation(body) {
  if (!Array.isArray(body) || body.length !== 1 || !body[0] ||
    typeof body[0] !== "object" || Array.isArray(body[0]) ||
    Object.keys(body[0]).length !== 1 || body[0].reset_applied !== true) fail();
}

async function query(configuration, fetchImpl, queryText, readOnly) {
  let response;
  try {
    response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${configuration.projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${configuration.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: queryText, parameters: [], read_only: readOnly }),
      },
    );
  } catch {
    fail();
  }
  if (!response?.ok) fail();
  try {
    return await response.json();
  } catch {
    fail();
  }
}

export function readProductionDisposableResetConfiguration(environment) {
  const configuration = {
    projectRef: requiredString(environment?.PRODUCTION_SUPABASE_PROJECT_REF),
    loadProjectRef: requiredString(environment?.LOAD_SUPABASE_PROJECT_REF),
    authorizationId: requiredString(environment?.RESET_AUTHORIZATION_ID),
    accessToken: requiredString(environment?.SUPABASE_ACCESS_TOKEN),
  };
  if (configuration.projectRef !== PRODUCTION_PROJECT_REF ||
    configuration.loadProjectRef !== LOAD_PROJECT_REF ||
    configuration.projectRef === configuration.loadProjectRef ||
    configuration.authorizationId !== AUTHORIZATION_ID) fail();
  return Object.freeze(configuration);
}

export async function runProductionDisposableReset(
  environment,
  {
    fetchImpl = globalThis.fetch,
    writeStdout = (value) => process.stdout.write(value),
  } = {},
) {
  const configuration = readProductionDisposableResetConfiguration(environment);
  if (typeof fetchImpl !== "function") fail();
  parseMutation(await query(configuration, fetchImpl, MUTATION_QUERY, false));
  const aggregate = parseAggregate(await query(
    configuration,
    fetchImpl,
    VERIFICATION_QUERY,
    true,
  ));
  if (JSON.stringify(aggregate) !== JSON.stringify(Object.fromEntries(
    Object.entries(FIELDS).map(([name, field]) => [name, CANONICAL_AFTER[field]]),
  ))) fail();
  const receipt = Object.freeze({
    projectRef: configuration.projectRef,
    authorizationId: configuration.authorizationId,
    resetApplied: true,
    ...aggregate,
  });
  writeStdout(`${JSON.stringify(receipt)}\n`);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runProductionDisposableReset(process.env);
}
