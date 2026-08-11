import { describe, expect, it } from "vitest";

import {
  createDisposableStateFailureReceipt,
  evaluateDisposableStateSnapshot,
  fetchDisposableStateSnapshot,
  readDisposableStateConfiguration,
  runDisposableStatePreflight,
} from "../../scripts/production-disposable-state-core.mjs";

const productionRef = "ghohuwwjxgjqnbsauvzq";
const loadRef = "vadyhuipwbtgbzpeisbn";
const productionUrl = `https://${productionRef}.supabase.co`;
const accessToken = "management-token-value";

const environment = {
  RELEASE_MODE: "disposable-upgrade",
  PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
  LOAD_SUPABASE_PROJECT_REF: loadRef,
  PRODUCTION_SUPABASE_URL: productionUrl,
  SUPABASE_ACCESS_TOKEN: accessToken,
};

const configuration = {
  releaseMode: "disposable-upgrade",
  projectRef: productionRef,
  loadProjectRef: loadRef,
  url: productionUrl,
  accessToken,
};

const disposable = {
  markedTeacherCount: 1,
  otherAuthUserCount: 0,
  productionClassroomCount: 1,
  otherCohortCount: 0,
  productionClassroomGroupCount: 5,
  joinWindowCount: 0,
  sessionControlCount: 0,
  openJoiningCount: 0,
  openQuestStartCount: 0,
  cohortGroupJoinCodeCount: 0,
  auditEventCount: 0,
  studentPrivateProfileCount: 0,
  studentPublicProfileCount: 0,
  questAttemptCount: 0,
  phaseProgressCount: 0,
  studentResponseCount: 0,
  conceptEvidenceCount: 0,
  attemptItemCount: 0,
  questReflectionCount: 0,
  questResultCount: 0,
  teamScoreSnapshotCount: 0,
  studentJoinRequestCount: 0,
  studentCredentialCount: 0,
  nonTeacherSessionCount: 0,
  studentLoginAttemptCount: 0,
  joinAttemptCount: 0,
  recoveryAttemptCount: 0,
  groupIdentityReceiptCount: 0,
  groupMediaAssetCount: 0,
  cohortQuestLaunchCount: 0,
  cohortQuestLaunchReceiptCount: 0,
  teacherControlAuditCount: 0,
  teacherRosterControlReceiptCount: 0,
  groupImageObjectCount: 0,
};

const expectedEvidence = {
  projectRef: productionRef,
  releaseMode: "disposable-upgrade",
  replaceableState: true,
  ...disposable,
};

const protectedDisposable = {
  ...disposable,
  studentCredentialCount: 1,
  email: "student@example.test",
  providerResponse: "sensitive-provider-response",
};

const expectedFailureReceipt = {
  projectRef: productionRef,
  releaseMode: "disposable-upgrade",
  replaceableState: false,
  ...disposable,
  studentCredentialCount: 1,
};

function response(body, { status = 201 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerRow(snapshot = disposable) {
  return {
    marked_teacher_count: snapshot.markedTeacherCount,
    other_auth_user_count: snapshot.otherAuthUserCount,
    production_classroom_count: snapshot.productionClassroomCount,
    other_cohort_count: snapshot.otherCohortCount,
    production_classroom_group_count: snapshot.productionClassroomGroupCount,
    join_window_count: snapshot.joinWindowCount,
    session_control_count: snapshot.sessionControlCount,
    open_joining_count: snapshot.openJoiningCount,
    open_quest_start_count: snapshot.openQuestStartCount,
    cohort_group_join_code_count: snapshot.cohortGroupJoinCodeCount,
    audit_event_count: snapshot.auditEventCount,
    student_private_profile_count: snapshot.studentPrivateProfileCount,
    student_public_profile_count: snapshot.studentPublicProfileCount,
    quest_attempt_count: snapshot.questAttemptCount,
    phase_progress_count: snapshot.phaseProgressCount,
    student_response_count: snapshot.studentResponseCount,
    concept_evidence_count: snapshot.conceptEvidenceCount,
    attempt_item_count: snapshot.attemptItemCount,
    quest_reflection_count: snapshot.questReflectionCount,
    quest_result_count: snapshot.questResultCount,
    team_score_snapshot_count: snapshot.teamScoreSnapshotCount,
    student_join_request_count: snapshot.studentJoinRequestCount,
    student_credential_count: snapshot.studentCredentialCount,
    non_teacher_session_count: snapshot.nonTeacherSessionCount,
    student_login_attempt_count: snapshot.studentLoginAttemptCount,
    join_attempt_count: snapshot.joinAttemptCount,
    recovery_attempt_count: snapshot.recoveryAttemptCount,
    group_identity_receipt_count: snapshot.groupIdentityReceiptCount,
    group_media_asset_count: snapshot.groupMediaAssetCount,
    cohort_quest_launch_count: snapshot.cohortQuestLaunchCount,
    cohort_quest_launch_receipt_count: snapshot.cohortQuestLaunchReceiptCount,
    teacher_control_audit_count: snapshot.teacherControlAuditCount,
    teacher_roster_control_receipt_count: snapshot.teacherRosterControlReceiptCount,
    group_image_object_count: snapshot.groupImageObjectCount,
  };
}

function optionalLoginTablePresence({
  studentCredentials = true,
  studentLoginAttempts = true,
} = {}) {
  return {
    student_login_credentials_present: studentCredentials,
    student_login_attempts_present: studentLoginAttempts,
  };
}

function schemaAwareAggregateFetch(snapshot = disposable) {
  let requestCount = 0;
  return async () => {
    requestCount += 1;
    return response(requestCount === 1
      ? [optionalLoginTablePresence()]
      : [providerRow(snapshot)]);
  };
}

function expectRedactedFailure(action) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Disposable production preflight failed");
    expect(error.message).not.toContain(accessToken);
    return;
  }
  throw new Error("Expected disposable-state preflight to reject");
}

async function expectRedactedAsyncFailure(action) {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Disposable production preflight failed");
    expect(error.message).not.toContain(accessToken);
    expect(error.message).not.toContain("sensitive-provider-response");
    return;
  }
  throw new Error("Expected disposable-state preflight to reject");
}

describe("disposable production state", () => {
  it("reads only the exact disposable production configuration", () => {
    expect(readDisposableStateConfiguration(environment)).toEqual(configuration);
  });

  it("accepts only the exact closed replaceable classroom fixture", () => {
    expect(evaluateDisposableStateSnapshot(disposable, configuration))
      .toEqual(expectedEvidence);
  });

  it("creates a redaction-safe receipt from a validated protected snapshot", () => {
    expect(createDisposableStateFailureReceipt(protectedDisposable, configuration))
      .toEqual(expectedFailureReceipt);
    expect(JSON.stringify(createDisposableStateFailureReceipt(protectedDisposable, configuration)))
      .not.toContain("student@example.test");
    expect(JSON.stringify(createDisposableStateFailureReceipt(protectedDisposable, configuration)))
      .not.toContain("sensitive-provider-response");
  });

  it("emits the redaction-safe receipt to stderr when classification fails", async () => {
    const stdout = [];
    const stderr = [];

    await expect(runDisposableStatePreflight(environment, {
      fetchImpl: schemaAwareAggregateFetch(protectedDisposable),
      writeStdout: (value) => stdout.push(value),
      writeStderr: (value) => stderr.push(value),
    })).rejects.toThrow("Disposable production preflight failed");

    expect(stdout).toEqual([]);
    expect(stderr).toEqual([`${JSON.stringify(expectedFailureReceipt)}\n`]);
  });

  it("preserves the generic classification failure when receipt output fails", async () => {
    await expect(runDisposableStatePreflight(environment, {
      fetchImpl: schemaAwareAggregateFetch(protectedDisposable),
      writeStdout: () => {},
      writeStderr: () => { throw new Error("stderr-unavailable"); },
    })).rejects.toThrow("Disposable production preflight failed");
  });

  it("does not emit a failure receipt after a successful classification", async () => {
    const stderr = [];

    await expect(runDisposableStatePreflight(environment, {
      fetchImpl: schemaAwareAggregateFetch(),
      writeStdout: () => { throw new Error("stdout-unavailable"); },
      writeStderr: (value) => stderr.push(value),
    })).rejects.toThrow("stdout-unavailable");

    expect(stderr).toEqual([]);
  });

  it.each([
    ["configuration", { ...environment, RELEASE_MODE: "upgrade" }, async () => response([providerRow()])],
    ["network", environment, async () => { throw new Error("sensitive-provider-response"); }],
    ["malformed response", environment, async () => response({ error: "sensitive-provider-response" })],
  ])("emits no receipt before a validated snapshot: %s", async (_label, runEnvironment, fetchImpl) => {
    const stderr = [];

    await expect(runDisposableStatePreflight(runEnvironment, {
      fetchImpl,
      writeStdout: () => {},
      writeStderr: (value) => stderr.push(value),
    })).rejects.toThrow("Disposable production preflight failed");

    expect(stderr).toEqual([]);
  });

  it.each([
    ["student private profile", "studentPrivateProfileCount"],
    ["student public profile", "studentPublicProfileCount"],
    ["quest attempt", "questAttemptCount"],
    ["phase progress", "phaseProgressCount"],
    ["student response", "studentResponseCount"],
    ["concept evidence", "conceptEvidenceCount"],
    ["attempt item", "attemptItemCount"],
    ["quest reflection", "questReflectionCount"],
    ["quest result", "questResultCount"],
    ["team score snapshot", "teamScoreSnapshotCount"],
    ["student join request", "studentJoinRequestCount"],
    ["closed or open join window", "joinWindowCount"],
    ["closed or open session control", "sessionControlCount"],
    ["cohort group join code", "cohortGroupJoinCodeCount"],
    ["audit event", "auditEventCount"],
    ["student credential", "studentCredentialCount"],
    ["student login attempt", "studentLoginAttemptCount"],
    ["join attempt", "joinAttemptCount"],
    ["recovery attempt", "recoveryAttemptCount"],
    ["group identity receipt", "groupIdentityReceiptCount"],
    ["group media asset", "groupMediaAssetCount"],
    ["quest launch", "cohortQuestLaunchCount"],
    ["quest launch receipt", "cohortQuestLaunchReceiptCount"],
    ["teacher control audit", "teacherControlAuditCount"],
    ["teacher roster control receipt", "teacherRosterControlReceiptCount"],
    ["group-images object", "groupImageObjectCount"],
  ])("rejects a protected %s record", (_label, name) => {
    expectRedactedFailure(() => evaluateDisposableStateSnapshot({
      ...disposable,
      [name]: 1,
    }, configuration));
  });

  it.each([
    ["unmarked Auth account", "otherAuthUserCount", 1],
    ["missing marked teacher", "markedTeacherCount", 0],
    ["additional marked teacher", "markedTeacherCount", 2],
    ["missing production classroom", "productionClassroomCount", 0],
    ["additional cohort", "otherCohortCount", 1],
    ["wrong group count", "productionClassroomGroupCount", 4],
    ["open joining", "openJoiningCount", 1],
    ["open quest start", "openQuestStartCount", 1],
  ])("rejects unexpected classroom state: %s", (_label, name, value) => {
    expectRedactedFailure(() => evaluateDisposableStateSnapshot({
      ...disposable,
      [name]: value,
    }, configuration));
  });

  it("permits marked teacher sessions while blocking non-teacher sessions", () => {
    expect(evaluateDisposableStateSnapshot({
      ...disposable,
      markedTeacherSessionCount: 1,
    }, configuration)).toEqual(expectedEvidence);
    expectRedactedFailure(() => evaluateDisposableStateSnapshot({
      ...disposable,
      nonTeacherSessionCount: 1,
    }, configuration));
  });

  it.each([-1, 0.5, "0", null, undefined])(
    "rejects a malformed aggregate count: %j",
    (markedTeacherCount) => {
      expectRedactedFailure(() => evaluateDisposableStateSnapshot({
        ...disposable,
        markedTeacherCount,
      }, configuration));
    },
  );

  it.each([
    ["RELEASE_MODE", "upgrade"],
    ["PRODUCTION_SUPABASE_PROJECT_REF", loadRef],
    ["PRODUCTION_SUPABASE_URL", `https://${loadRef}.supabase.co`],
    ["LOAD_SUPABASE_PROJECT_REF", productionRef],
    ["SUPABASE_ACCESS_TOKEN", ""],
  ])("rejects an unsafe configuration value: %s", (name, value) => {
    expectRedactedFailure(() => readDisposableStateConfiguration({
      ...environment,
      [name]: value,
    }));
  });

  it("reads validated optional table presence before one aggregate snapshot", async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url: String(url), options });
      return response(requests.length === 1
        ? [optionalLoginTablePresence()]
        : [providerRow()]);
    };

    await expect(fetchDisposableStateSnapshot(configuration, fetchImpl))
      .resolves.toEqual(disposable);
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(
      `https://api.supabase.com/v1/projects/${productionRef}/database/query`,
    );
    const presencePayload = JSON.parse(requests[0].options.body);
    const aggregatePayload = JSON.parse(requests[1].options.body);
    expect(presencePayload).toMatchObject({ read_only: true, parameters: [] });
    expect(presencePayload.query).toContain("to_regclass('private.student_login_credentials')");
    expect(presencePayload.query).toContain("to_regclass('private.student_login_attempts')");
    expect(aggregatePayload).toMatchObject({
      read_only: true,
      parameters: ["course-owner-2026-08-08", "teacher", "Production Classroom"],
    });
    expect(aggregatePayload.query).toContain("from auth.sessions as sessions");
    expect(aggregatePayload.query).toContain(
      "where sessions.user_id not in (select id from marked_teachers)",
    );
    expect(JSON.stringify(requests.map(({ options }) => options.body))).not.toContain(accessToken);
  });

  it("treats validated absent optional login tables as zero without querying them", async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url: String(url), options });
      return response(requests.length === 1
        ? [optionalLoginTablePresence({
          studentCredentials: false,
          studentLoginAttempts: false,
        })]
        : [providerRow()]);
    };

    await expect(fetchDisposableStateSnapshot(configuration, fetchImpl))
      .resolves.toEqual(disposable);

    expect(requests).toHaveLength(2);
    const presencePayload = JSON.parse(requests[0].options.body);
    const aggregatePayload = JSON.parse(requests[1].options.body);
    expect(presencePayload).toMatchObject({ read_only: true, parameters: [] });
    expect(presencePayload.query).toContain("to_regclass('private.student_login_credentials')");
    expect(presencePayload.query).toContain("to_regclass('private.student_login_attempts')");
    expect(aggregatePayload.query).toContain("0::int as student_credential_count");
    expect(aggregatePayload.query).toContain("0::int as student_login_attempt_count");
    expect(aggregatePayload.query).not.toContain("from private.student_login_credentials");
    expect(aggregatePayload.query).not.toContain("from private.student_login_attempts");
  });

  it("counts each validated present optional login table exactly", async () => {
    const fetchImpl = async (_url, options) => {
      const { query } = JSON.parse(options.body);
      if (query.includes("to_regclass")) {
        return response([optionalLoginTablePresence()]);
      }
      return response([providerRow({
        ...disposable,
        studentCredentialCount: 2,
        studentLoginAttemptCount: 3,
      })]);
    };

    await expect(fetchDisposableStateSnapshot(configuration, fetchImpl)).resolves.toEqual({
      ...disposable,
      studentCredentialCount: 2,
      studentLoginAttemptCount: 3,
    });
  });

  it("fails closed on an ambiguous optional login table presence result", async () => {
    let requestCount = 0;

    await expectRedactedAsyncFailure(() => fetchDisposableStateSnapshot(
      configuration,
      async () => {
        requestCount += 1;
        return response([{
          ...optionalLoginTablePresence(),
          unexpected_optional_relation: true,
        }]);
      },
    ));

    expect(requestCount).toBe(1);
  });

  it("rejects malformed Management API aggregate responses without details", async () => {
    await expectRedactedAsyncFailure(() => fetchDisposableStateSnapshot(
      configuration,
      async () => response({ error: "sensitive-provider-response" }),
    ));
  });

  it("rejects Management API failures without provider details", async () => {
    await expectRedactedAsyncFailure(() => fetchDisposableStateSnapshot(
      configuration,
      async () => response({ error: "sensitive-provider-response" }, { status: 503 }),
    ));
  });

  it("rejects Management API network failures without provider details", async () => {
    await expectRedactedAsyncFailure(() => fetchDisposableStateSnapshot(
      configuration,
      async () => { throw new Error("sensitive-provider-response"); },
    ));
  });
});
