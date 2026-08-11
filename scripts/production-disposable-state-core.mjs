const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const TEACHER_MARKER = "course-owner-2026-08-08";
const FAILURE_MESSAGE = "Disposable production preflight failed";

const OPTIONAL_LOGIN_TABLES = Object.freeze({
  studentCredentialCount: Object.freeze({
    presenceField: "student_login_credentials_present",
    relation: "private.student_login_credentials",
    aggregateField: "student_credential_count",
  }),
  studentLoginAttemptCount: Object.freeze({
    presenceField: "student_login_attempts_present",
    relation: "private.student_login_attempts",
    aggregateField: "student_login_attempt_count",
  }),
});

const OPTIONAL_LOGIN_TABLE_PRESENCE_QUERY = `select
  to_regclass('private.student_login_credentials') is not null
    as student_login_credentials_present,
  to_regclass('private.student_login_attempts') is not null
    as student_login_attempts_present`;

function optionalLoginTableCount(optionalLoginTables, name) {
  const table = OPTIONAL_LOGIN_TABLES[name];
  return optionalLoginTables[name]
    ? `(select count(*)::int from ${table.relation}) as ${table.aggregateField}`
    : `0::int as ${table.aggregateField}`;
}

function databaseQuery(optionalLoginTables) {
  return `with marked_teachers as (
  select users.id
  from auth.users as users
  where users.raw_app_meta_data ->> 'bootstrapAuthorizationId' = $1
    and users.raw_app_meta_data ->> 'role' = $2
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = users.id and roles.role = 'teacher'
    )
), production_classrooms as (
  select cohorts.id
  from public.cohorts as cohorts
  join marked_teachers on marked_teachers.id = cohorts.teacher_id
  where cohorts.title = $3
    and cohorts.group_count = 5
    and cohorts.archived_at is null
)
select
  (select count(*)::int from marked_teachers) as marked_teacher_count,
  (select count(*)::int from auth.users) -
    (select count(*)::int from marked_teachers) as other_auth_user_count,
  (select count(*)::int from production_classrooms) as production_classroom_count,
  (select count(*)::int from public.cohorts) -
    (select count(*)::int from production_classrooms) as other_cohort_count,
  (select count(*)::int from public.groups
    where cohort_id in (select id from production_classrooms))
    as production_classroom_group_count,
  (select count(*)::int from public.cohort_join_windows) as join_window_count,
  (select count(*)::int from public.cohort_session_controls)
    as session_control_count,
  (select count(*)::int from public.cohort_join_windows where closed_at is null)
    as open_joining_count,
  (select count(*)::int from public.cohort_session_controls
    where quest_starts_allowed = true and closed_at is null)
    as open_quest_start_count,
  (select count(*)::int from public.cohort_group_join_codes)
    as cohort_group_join_code_count,
  (select count(*)::int from public.audit_events) as audit_event_count,
  (select count(*)::int from public.student_private_profiles)
    as student_private_profile_count,
  (select count(*)::int from public.student_public_profiles)
    as student_public_profile_count,
  (select count(*)::int from public.quest_attempts) as quest_attempt_count,
  (select count(*)::int from public.phase_progress) as phase_progress_count,
  (select count(*)::int from public.student_responses) as student_response_count,
  (select count(*)::int from public.concept_evidence) as concept_evidence_count,
  (select count(*)::int from public.attempt_items) as attempt_item_count,
  (select count(*)::int from public.quest_reflections) as quest_reflection_count,
  (select count(*)::int from public.quest_results) as quest_result_count,
  (select count(*)::int from public.team_score_snapshots) as team_score_snapshot_count,
  (select count(*)::int from public.student_join_requests) as student_join_request_count,
  ${optionalLoginTableCount(optionalLoginTables, "studentCredentialCount")},
  (select count(*)::int from auth.sessions as sessions
    where sessions.user_id not in (select id from marked_teachers))
    as non_teacher_session_count,
  ${optionalLoginTableCount(optionalLoginTables, "studentLoginAttemptCount")},
  (select count(*)::int from private.join_attempts) as join_attempt_count,
  (select count(*)::int from private.session_recovery_tokens) as recovery_attempt_count,
  (select count(*)::int from private.group_identity_receipts) as group_identity_receipt_count,
  (select count(*)::int from private.group_media_assets) as group_media_asset_count,
  (select count(*)::int from public.cohort_quest_launches) as cohort_quest_launch_count,
  (select count(*)::int from private.cohort_quest_launch_receipts)
    as cohort_quest_launch_receipt_count,
  (select count(*)::int from private.teacher_control_audit)
    as teacher_control_audit_count,
  (select count(*)::int from private.teacher_roster_control_receipts)
    as teacher_roster_control_receipt_count,
  (select count(*)::int from storage.objects where bucket_id = 'group-images')
    as group_image_object_count`;
}

const DATABASE_FIELDS = {
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
  studentCredentialCount: "student_credential_count",
  nonTeacherSessionCount: "non_teacher_session_count",
  studentLoginAttemptCount: "student_login_attempt_count",
  joinAttemptCount: "join_attempt_count",
  recoveryAttemptCount: "recovery_attempt_count",
  groupIdentityReceiptCount: "group_identity_receipt_count",
  groupMediaAssetCount: "group_media_asset_count",
  cohortQuestLaunchCount: "cohort_quest_launch_count",
  cohortQuestLaunchReceiptCount: "cohort_quest_launch_receipt_count",
  teacherControlAuditCount: "teacher_control_audit_count",
  teacherRosterControlReceiptCount: "teacher_roster_control_receipt_count",
  groupImageObjectCount: "group_image_object_count",
};

const APPROVED_SETUP_RESIDUE_COUNTS = Object.freeze({
  markedTeacherCount: 1,
  otherAuthUserCount: 1,
  productionClassroomCount: 1,
  otherCohortCount: 1,
  productionClassroomGroupCount: 5,
  joinWindowCount: 4,
  sessionControlCount: 0,
  openJoiningCount: 0,
  openQuestStartCount: 0,
  cohortGroupJoinCodeCount: 24,
  auditEventCount: 7,
  studentPrivateProfileCount: 1,
  studentPublicProfileCount: 1,
  questAttemptCount: 0,
  phaseProgressCount: 0,
  studentResponseCount: 0,
  conceptEvidenceCount: 0,
  attemptItemCount: 0,
  questReflectionCount: 0,
  questResultCount: 0,
  teamScoreSnapshotCount: 0,
  studentJoinRequestCount: 1,
  studentCredentialCount: 0,
  nonTeacherSessionCount: 1,
  studentLoginAttemptCount: 0,
  joinAttemptCount: 1,
  recoveryAttemptCount: 0,
  groupIdentityReceiptCount: 1,
  groupMediaAssetCount: 0,
  cohortQuestLaunchCount: 0,
  cohortQuestLaunchReceiptCount: 0,
  teacherControlAuditCount: 0,
  teacherRosterControlReceiptCount: 0,
  groupImageObjectCount: 0,
});

function fail() {
  throw new Error(FAILURE_MESSAGE);
}

function requiredString(value) {
  if (typeof value !== "string" || value.length === 0) fail();
  return value;
}

function aggregate(value) {
  if (!Number.isInteger(value) || value < 0) fail();
  return value;
}

function aggregateCounts(snapshot) {
  if (!snapshot || typeof snapshot !== "object") fail();
  return Object.fromEntries(Object.entries(DATABASE_FIELDS).map(([name]) => [
    name,
    aggregate(snapshot[name]),
  ]));
}

function hasExpectedIdentity(configuration) {
  return configuration?.releaseMode === "disposable-upgrade" &&
    configuration.projectRef === PRODUCTION_PROJECT_REF &&
    configuration.loadProjectRef === LOAD_PROJECT_REF &&
    configuration.projectRef !== configuration.loadProjectRef &&
    configuration.url === PRODUCTION_URL;
}

export function readDisposableStateConfiguration(environment) {
  const configuration = {
    releaseMode: requiredString(environment?.RELEASE_MODE),
    projectRef: requiredString(environment?.PRODUCTION_SUPABASE_PROJECT_REF),
    loadProjectRef: requiredString(environment?.LOAD_SUPABASE_PROJECT_REF),
    url: requiredString(environment?.PRODUCTION_SUPABASE_URL),
    accessToken: requiredString(environment?.SUPABASE_ACCESS_TOKEN),
  };
  if (!hasExpectedIdentity(configuration)) fail();
  return Object.freeze(configuration);
}

export function evaluateDisposableStateSnapshot(snapshot, configuration) {
  if (!hasExpectedIdentity(configuration)) fail();
  const counts = aggregateCounts(snapshot);
  const canonicalState =
    counts.markedTeacherCount !== 1 ||
    counts.otherAuthUserCount !== 0 ||
    counts.productionClassroomCount !== 1 ||
    counts.otherCohortCount !== 0 ||
    counts.productionClassroomGroupCount !== 5 ||
    counts.openJoiningCount !== 0 ||
    counts.openQuestStartCount !== 0
      ? false
      : Object.entries(counts).every(([name, value]) => [
        "markedTeacherCount",
        "productionClassroomCount",
        "productionClassroomGroupCount",
      ].includes(name) || value === 0);
  const approvedSetupResidue = Object.entries(APPROVED_SETUP_RESIDUE_COUNTS)
    .every(([name, value]) => name === "joinAttemptCount"
      ? counts[name] <= value
      : counts[name] === value);
  if (!canonicalState && !approvedSetupResidue) fail();
  return Object.freeze({
    projectRef: configuration.projectRef,
    releaseMode: configuration.releaseMode,
    replaceableState: true,
    preservedSetupResidue: approvedSetupResidue,
    ...counts,
  });
}

export function createDisposableStateFailureReceipt(snapshot, configuration) {
  if (!hasExpectedIdentity(configuration)) fail();
  return Object.freeze({
    projectRef: configuration.projectRef,
    releaseMode: configuration.releaseMode,
    replaceableState: false,
    ...aggregateCounts(snapshot),
  });
}

function databaseSnapshot(body) {
  if (
    !Array.isArray(body) || body.length !== 1 || !body[0] ||
    typeof body[0] !== "object" || Array.isArray(body[0])
  ) fail();
  return Object.fromEntries(Object.entries(DATABASE_FIELDS).map(([name, field]) => [
    name,
    aggregate(body[0][field]),
  ]));
}

function optionalLoginTablePresence(body) {
  const fields = Object.values(OPTIONAL_LOGIN_TABLES).map(({ presenceField }) => presenceField);
  if (
    !Array.isArray(body) || body.length !== 1 || !body[0] ||
    typeof body[0] !== "object" || Array.isArray(body[0]) ||
    Object.keys(body[0]).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(body[0], field))
  ) fail();
  return Object.freeze(Object.fromEntries(Object.entries(OPTIONAL_LOGIN_TABLES).map(([
    name,
    { presenceField },
  ]) => {
    if (typeof body[0][presenceField] !== "boolean") fail();
    return [name, body[0][presenceField]];
  })));
}

async function managementDatabaseQuery(configuration, fetchImpl, query, parameters) {
  let response;
  try {
    response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${configuration.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, parameters, read_only: true }),
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

export async function fetchDisposableStateSnapshot(configuration, fetchImpl = globalThis.fetch) {
  if (!hasExpectedIdentity(configuration) || typeof fetchImpl !== "function") fail();
  const optionalLoginTables = optionalLoginTablePresence(await managementDatabaseQuery(
    configuration,
    fetchImpl,
    OPTIONAL_LOGIN_TABLE_PRESENCE_QUERY,
    [],
  ));
  try {
    return Object.freeze(databaseSnapshot(await managementDatabaseQuery(
      configuration,
      fetchImpl,
      databaseQuery(optionalLoginTables),
      [TEACHER_MARKER, "teacher", "Production Classroom"],
    )));
  } catch (error) {
    if (error?.message === FAILURE_MESSAGE) throw error;
    fail();
  }
}

export async function runDisposableStatePreflight(
  environment,
  {
    fetchImpl = globalThis.fetch,
    writeStdout = (value) => process.stdout.write(value),
    writeStderr = (value) => process.stderr.write(value),
  } = {},
) {
  const configuration = readDisposableStateConfiguration(environment);
  const snapshot = await fetchDisposableStateSnapshot(configuration, fetchImpl);
  let evidence;
  try {
    evidence = evaluateDisposableStateSnapshot(snapshot, configuration);
  } catch (error) {
    try {
      writeStderr(`${JSON.stringify(
        createDisposableStateFailureReceipt(snapshot, configuration),
      )}\n`);
    } catch {
      // Preserve the generic classifier failure when diagnostic output fails.
    }
    throw error;
  }
  writeStdout(`${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}
