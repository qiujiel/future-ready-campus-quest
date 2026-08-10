const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const TEACHER_MARKER = "course-owner-2026-08-08";
const FAILURE_MESSAGE = "Disposable production preflight failed";

const DATABASE_QUERY = `with marked_teachers as (
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
  (select count(*)::int from public.cohort_join_windows where closed_at is null)
    as open_joining_count,
  (select count(*)::int from public.cohort_session_controls
    where quest_starts_allowed = true and closed_at is null)
    as open_quest_start_count,
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
  (select count(*)::int from private.student_login_credentials) as student_credential_count,
  (select count(*)::int from auth.sessions) as student_session_count,
  (select count(*)::int from private.student_login_attempts) as student_login_attempt_count,
  (select count(*)::int from private.join_attempts) as join_attempt_count,
  (select count(*)::int from private.session_recovery_tokens) as recovery_attempt_count,
  (select count(*)::int from private.group_identity_receipts) as group_identity_receipt_count,
  (select count(*)::int from private.group_media_assets) as group_media_asset_count,
  (select count(*)::int from public.cohort_quest_launches) as cohort_quest_launch_count,
  (select count(*)::int from private.cohort_quest_launch_receipts)
    as cohort_quest_launch_receipt_count,
  (select count(*)::int from storage.objects where bucket_id = 'group-images')
    as group_image_object_count`;

const DATABASE_FIELDS = {
  markedTeacherCount: "marked_teacher_count",
  otherAuthUserCount: "other_auth_user_count",
  productionClassroomCount: "production_classroom_count",
  otherCohortCount: "other_cohort_count",
  productionClassroomGroupCount: "production_classroom_group_count",
  openJoiningCount: "open_joining_count",
  openQuestStartCount: "open_quest_start_count",
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
  studentSessionCount: "student_session_count",
  studentLoginAttemptCount: "student_login_attempt_count",
  joinAttemptCount: "join_attempt_count",
  recoveryAttemptCount: "recovery_attempt_count",
  groupIdentityReceiptCount: "group_identity_receipt_count",
  groupMediaAssetCount: "group_media_asset_count",
  cohortQuestLaunchCount: "cohort_quest_launch_count",
  cohortQuestLaunchReceiptCount: "cohort_quest_launch_receipt_count",
  groupImageObjectCount: "group_image_object_count",
};

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
  if (!hasExpectedIdentity(configuration) || !snapshot || typeof snapshot !== "object") {
    fail();
  }
  const counts = Object.fromEntries(Object.entries(DATABASE_FIELDS).map(([name]) => [
    name,
    aggregate(snapshot[name]),
  ]));
  if (
    counts.markedTeacherCount !== 1 ||
    counts.otherAuthUserCount !== 0 ||
    counts.productionClassroomCount !== 1 ||
    counts.otherCohortCount !== 0 ||
    counts.productionClassroomGroupCount !== 5 ||
    counts.openJoiningCount !== 0 ||
    counts.openQuestStartCount !== 0
  ) fail();
  for (const [name, value] of Object.entries(counts)) {
    if (![
      "markedTeacherCount",
      "productionClassroomCount",
      "productionClassroomGroupCount",
    ].includes(name) && value !== 0) fail();
  }
  return Object.freeze({
    projectRef: configuration.projectRef,
    releaseMode: configuration.releaseMode,
    replaceableState: true,
    ...counts,
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

export async function fetchDisposableStateSnapshot(configuration, fetchImpl = globalThis.fetch) {
  if (!hasExpectedIdentity(configuration) || typeof fetchImpl !== "function") fail();
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
        body: JSON.stringify({
          query: DATABASE_QUERY,
          parameters: [TEACHER_MARKER, "teacher", "Production Classroom"],
          read_only: true,
        }),
      },
    );
  } catch {
    fail();
  }
  if (!response?.ok) fail();
  try {
    return Object.freeze(databaseSnapshot(await response.json()));
  } catch (error) {
    if (error?.message === FAILURE_MESSAGE) throw error;
    fail();
  }
}
