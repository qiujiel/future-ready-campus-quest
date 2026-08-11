import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  canonicalGroupCount: "canonical_group_count",
  canonicalGroupsReady: "canonical_groups_ready",
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

const CANONICAL_AFTER = Object.freeze({
  marked_teacher_count: 1,
  other_auth_user_count: 0,
  production_classroom_count: 1,
  other_cohort_count: 0,
  production_classroom_group_count: 5,
  canonical_group_count: 5,
  canonical_groups_ready: true,
  join_window_count: 0,
  session_control_count: 0,
  open_joining_count: 0,
  open_quest_start_count: 0,
  cohort_group_join_code_count: 0,
  audit_event_count: 0,
  student_private_profile_count: 0,
  student_public_profile_count: 0,
  quest_attempt_count: 0,
  phase_progress_count: 0,
  student_response_count: 0,
  concept_evidence_count: 0,
  attempt_item_count: 0,
  quest_reflection_count: 0,
  quest_result_count: 0,
  team_score_snapshot_count: 0,
  student_join_request_count: 0,
  non_teacher_session_count: 0,
  join_attempt_count: 0,
  recovery_attempt_count: 0,
  group_identity_receipt_count: 0,
  group_media_asset_count: 0,
  cohort_quest_launch_count: 0,
  cohort_quest_launch_receipt_count: 0,
  teacher_control_audit_count: 0,
  teacher_roster_control_receipt_count: 0,
  group_image_object_count: 0,
  student_login_credentials_absent: true,
  student_login_attempts_absent: true,
});

const DIAGNOSTIC_FIELDS = Object.freeze({
  studentLoginCredentialsAbsent: "student_login_credentials_absent",
  studentLoginAttemptsAbsent: "student_login_attempts_absent",
  markedTeacherCount: "marked_teacher_count",
  markedTeacherUnique: "marked_teacher_unique",
  canonicalClassroomCandidateCount: "canonical_classroom_candidate_count",
  canonicalClassroomCapacityReady: "canonical_classroom_capacity_ready",
  canonicalCohortCount: "canonical_cohort_count",
  canonicalCohortGroupCount: "canonical_cohort_group_count",
  canonicalGroupNumberShapeReady: "canonical_group_number_shape_ready",
  noncanonicalGroupIdentityCount: "noncanonical_group_identity_count",
  noncanonicalGroupIdentityWithoutReceiptCount:
    "noncanonical_group_identity_without_receipt_count",
  groupIdentityReceiptCount: "group_identity_receipt_count",
  groupIdentityReceiptOutsideCanonicalCount:
    "group_identity_receipt_outside_canonical_count",
  groupIdentityReceiptScopeReady: "group_identity_receipt_scope_ready",
});

const DIAGNOSTIC_BOOLEAN_FIELDS = new Set([
  "student_login_credentials_absent",
  "student_login_attempts_absent",
  "marked_teacher_unique",
  "canonical_classroom_capacity_ready",
  "canonical_group_number_shape_ready",
  "group_identity_receipt_scope_ready",
]);

const DIAGNOSTIC_QUERY = `with marked_teachers as (
  select users.id
  from auth.users as users
  where users.raw_app_meta_data ->> 'bootstrapAuthorizationId' = '${TEACHER_MARKER}'
    and users.raw_app_meta_data ->> 'role' = 'teacher'
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = users.id and roles.role = 'teacher'
    )
), canonical_classroom_candidates as (
  select cohorts.id, cohorts.group_capacity
  from public.cohorts as cohorts
  where cohorts.teacher_id in (select id from marked_teachers)
    and cohorts.title = 'Production Classroom'
    and cohorts.group_count = 5
    and cohorts.archived_at is null
), canonical_cohorts as (
  select candidates.id
  from canonical_classroom_candidates as candidates
  where candidates.group_capacity = 6
), canonical_groups as (
  select groups.id, groups.group_number, groups.display_name,
    groups.identity_editor_id, groups.identity_locked_at,
    groups.image_object_path
  from public.groups as groups
  where groups.cohort_id in (select id from canonical_cohorts)
), noncanonical_identity_groups as (
  select groups.id
  from canonical_groups as groups
  where groups.display_name <> 'Group ' || groups.group_number::text
    or groups.identity_editor_id is not null
    or groups.identity_locked_at is not null
    or groups.image_object_path is not null
)
select
  to_regclass('private.student_login_credentials') is null
    as student_login_credentials_absent,
  to_regclass('private.student_login_attempts') is null
    as student_login_attempts_absent,
  (select count(*)::int from marked_teachers) as marked_teacher_count,
  (select count(*) = 1 from marked_teachers) as marked_teacher_unique,
  (select count(*)::int from canonical_classroom_candidates)
    as canonical_classroom_candidate_count,
  (select count(*) = 1 and bool_and(group_capacity = 6)
   from canonical_classroom_candidates)
    as canonical_classroom_capacity_ready,
  (select count(*)::int from canonical_cohorts) as canonical_cohort_count,
  (select count(*)::int from canonical_groups)
    as canonical_cohort_group_count,
  coalesce(
    (select array_agg(groups.group_number order by groups.group_number)
     from canonical_groups as groups
     where groups.group_number between 1 and 5),
    array[]::smallint[]
  ) = array[1, 2, 3, 4, 5]::smallint[]
    as canonical_group_number_shape_ready,
  (select count(*)::int from noncanonical_identity_groups)
    as noncanonical_group_identity_count,
  (select count(*)::int
   from noncanonical_identity_groups as groups
   where not exists (
     select 1 from private.group_identity_receipts as receipts
     where receipts.group_id = groups.id
   )) as noncanonical_group_identity_without_receipt_count,
  (select count(*)::int from private.group_identity_receipts)
    as group_identity_receipt_count,
  (select count(*)::int
   from private.group_identity_receipts as receipts
   where not exists (
     select 1 from canonical_groups as groups
     where groups.id = receipts.group_id
   )) as group_identity_receipt_outside_canonical_count,
  not exists (
    select 1
    from private.group_identity_receipts as receipts
    where not exists (
      select 1 from canonical_groups as groups
      where groups.id = receipts.group_id
    )
  ) as group_identity_receipt_scope_ready;`;

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
    and cohorts.group_capacity = 6
    and cohorts.archived_at is null
)
select jsonb_build_object(
  'marked_teacher_count', (select count(*)::int from marked_teachers),
  'other_auth_user_count', (select count(*)::int from auth.users) - (select count(*)::int from marked_teachers),
  'production_classroom_count', (select count(*)::int from production_classrooms),
  'other_cohort_count', (select count(*)::int from public.cohorts) - (select count(*)::int from production_classrooms),
  'production_classroom_group_count', (select count(*)::int from public.groups where cohort_id in (select id from production_classrooms)),
  'canonical_group_count', (select count(*)::int from public.groups as groups where groups.cohort_id in (select id from production_classrooms) and groups.group_number between 1 and 5 and groups.display_name = 'Group ' || groups.group_number::text and groups.identity_editor_id is null and groups.identity_locked_at is null and groups.image_object_path is null),
  'canonical_groups_ready', 5 = (select count(*)::int from public.groups as groups where groups.cohort_id in (select id from production_classrooms) and groups.group_number between 1 and 5 and groups.display_name = 'Group ' || groups.group_number::text and groups.identity_editor_id is null and groups.identity_locked_at is null and groups.image_object_path is null),
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

const VERIFICATION_QUERY = `with snapshot as (
${aggregateExpression()}
)
select
${Object.entries(FIELDS).map(([, field]) =>
  field.endsWith("_absent") || field.endsWith("_ready")
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
    if (field.endsWith("_absent") || field.endsWith("_ready")) {
      if (typeof value !== "boolean") fail();
    } else if (!Number.isInteger(value) || value < 0) {
      fail();
    }
    aggregate[name] = value;
  }
  return Object.freeze(aggregate);
}

function parseDiagnostic(body) {
  if (!Array.isArray(body) || body.length !== 1 || !body[0] ||
    typeof body[0] !== "object" || Array.isArray(body[0]) ||
    Object.keys(body[0]).length !== Object.keys(DIAGNOSTIC_FIELDS).length) {
    fail();
  }
  const diagnostic = {};
  for (const [name, field] of Object.entries(DIAGNOSTIC_FIELDS)) {
    if (!Object.hasOwn(body[0], field)) fail();
    const value = body[0][field];
    if (DIAGNOSTIC_BOOLEAN_FIELDS.has(field)) {
      if (typeof value !== "boolean") fail();
    } else if (!Number.isInteger(value) || value < 0) {
      fail();
    }
    diagnostic[name] = value;
  }
  return Object.freeze(diagnostic);
}

function request(configuration, query, readOnly) {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${configuration.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, parameters: [], read_only: readOnly }),
  };
}

async function attemptMutation(configuration, fetchImpl, mutationQuery) {
  try {
    const response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${configuration.projectRef}/database/query`,
      request(configuration, mutationQuery, false),
    );
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function verify(configuration, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${configuration.projectRef}/database/query`,
      request(configuration, VERIFICATION_QUERY, true),
    );
  } catch {
    fail();
  }
  if (!response?.ok) fail();
  try {
    return parseAggregate(await response.json());
  } catch (error) {
    if (error?.message === FAILURE_MESSAGE) throw error;
    fail();
  }
}

async function diagnose(configuration, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${configuration.projectRef}/database/query`,
      request(configuration, DIAGNOSTIC_QUERY, true),
    );
  } catch {
    fail();
  }
  if (!response?.ok) fail();
  try {
    return parseDiagnostic(await response.json());
  } catch (error) {
    if (error?.message === FAILURE_MESSAGE) throw error;
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
    baseDirectory = process.cwd(),
    fetchImpl = globalThis.fetch,
    writeStdout = (value) => process.stdout.write(value),
  } = {},
) {
  const configuration = readProductionDisposableResetConfiguration(environment);
  if (typeof fetchImpl !== "function") fail();
  let mutationQuery;
  try {
    mutationQuery = await readFile(
      resolve(
        baseDirectory,
        "supabase/reset/production-disposable-reset.sql",
      ),
      "utf8",
    );
  } catch {
    fail();
  }
  const mutationSucceeded = await attemptMutation(
    configuration,
    fetchImpl,
    mutationQuery,
  );
  if (!mutationSucceeded) {
    const diagnostic = await diagnose(configuration, fetchImpl);
    writeStdout(`${JSON.stringify(diagnostic)}\n`);
  }
  const aggregate = await verify(configuration, fetchImpl);
  if (!mutationSucceeded) fail();
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
