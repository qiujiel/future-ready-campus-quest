import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

import {
  readProductionDisposableResetConfiguration,
  runProductionDisposableReset,
} from "../../scripts/production-disposable-reset.mjs";
import {
  validateProductionDisposableResetConfiguration,
} from "../../scripts/deployment-config.mjs";

const root = resolve(import.meta.dirname, "../..");
const productionRef = "ghohuwwjxgjqnbsauvzq";
const loadRef = "vadyhuipwbtgbzpeisbn";
const authorizationId = "approved-disposable-reset-2026-08-11";
const accessToken = "management-token-value";
const identityCommands = Object.freeze([
  'test "$EXPECTED_SHA" = "$GITHUB_SHA"',
  'test "$EXPECTED_SHA" = "$(printf \'%s\' "$EXPECTED_SHA" | tr \'[:upper:]\' \'[:lower:]\')"',
  'printf \'%s\' "$EXPECTED_SHA" | grep -Eq \'^[0-9a-f]{40}$\'',
  `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${productionRef}"`,
  `test "$LOAD_SUPABASE_PROJECT_REF" = "${loadRef}"`,
  'test "$PRODUCTION_SUPABASE_PROJECT_REF" != "$LOAD_SUPABASE_PROJECT_REF"',
  `test "$RESET_AUTHORIZATION_ID" = "${authorizationId}"`,
]);

const environment = Object.freeze({
  PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
  LOAD_SUPABASE_PROJECT_REF: loadRef,
  RESET_AUTHORIZATION_ID: authorizationId,
  SUPABASE_ACCESS_TOKEN: accessToken,
});

const approvedBefore = Object.freeze({
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

const canonicalAfter = Object.freeze({
  ...approvedBefore,
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
  canonical_group_count: 5,
  canonical_groups_ready: true,
});

const expectedReceipt = Object.freeze({
  projectRef: productionRef,
  authorizationId,
  resetApplied: true,
  markedTeacherCount: 1,
  otherAuthUserCount: 0,
  productionClassroomCount: 1,
  otherCohortCount: 0,
  productionClassroomGroupCount: 5,
  canonicalGroupCount: 5,
  canonicalGroupsReady: true,
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
  nonTeacherSessionCount: 0,
  joinAttemptCount: 0,
  recoveryAttemptCount: 0,
  groupIdentityReceiptCount: 0,
  groupMediaAssetCount: 0,
  cohortQuestLaunchCount: 0,
  cohortQuestLaunchReceiptCount: 0,
  teacherControlAuditCount: 0,
  teacherRosterControlReceiptCount: 0,
  groupImageObjectCount: 0,
  studentLoginCredentialsAbsent: true,
  studentLoginAttemptsAbsent: true,
});

const safeDiagnostic = Object.freeze({
  student_login_credentials_absent: true,
  student_login_attempts_absent: true,
  marked_teacher_count: 1,
  marked_teacher_unique: true,
  canonical_classroom_candidate_count: 1,
  canonical_classroom_capacity_ready: true,
  canonical_cohort_count: 1,
  canonical_cohort_group_count: 5,
  canonical_group_number_shape_ready: true,
  noncanonical_group_identity_count: 1,
  noncanonical_group_identity_without_receipt_count: 1,
  group_identity_receipt_count: 1,
  group_identity_receipt_outside_canonical_count: 0,
  group_identity_receipt_scope_ready: true,
});

const expectedDiagnosticReceipt = Object.freeze({
  studentLoginCredentialsAbsent: true,
  studentLoginAttemptsAbsent: true,
  markedTeacherCount: 1,
  markedTeacherUnique: true,
  canonicalClassroomCandidateCount: 1,
  canonicalClassroomCapacityReady: true,
  canonicalCohortCount: 1,
  canonicalCohortGroupCount: 5,
  canonicalGroupNumberShapeReady: true,
  noncanonicalGroupIdentityCount: 1,
  noncanonicalGroupIdentityWithoutReceiptCount: 1,
  groupIdentityReceiptCount: 1,
  groupIdentityReceiptOutsideCanonicalCount: 0,
  groupIdentityReceiptScopeReady: true,
});

function response(body, { status = 201, raw = false } = {}) {
  return new Response(raw ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resetFetch({
  mutationResponse = response("opaque provider response", { raw: true }),
  verificationResponse = response([canonicalAfter]),
  diagnosticResponse = response([safeDiagnostic]),
} = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      const candidate = calls.length === 1
        ? mutationResponse
        : calls.length === 2 && !mutationResponse.ok
          ? diagnosticResponse
          : verificationResponse;
      if (candidate instanceof Error) throw candidate;
      return candidate;
    },
  };
}

describe("production disposable reset", () => {
  it("accepts only the exact production, load, authorization, and protected token inputs", () => {
    expect(readProductionDisposableResetConfiguration(environment)).toEqual({
      projectRef: productionRef,
      loadProjectRef: loadRef,
      authorizationId,
      accessToken,
    });
    for (const [name, value] of Object.entries({
      PRODUCTION_SUPABASE_PROJECT_REF: loadRef,
      LOAD_SUPABASE_PROJECT_REF: productionRef,
      RESET_AUTHORIZATION_ID: "not-approved",
      SUPABASE_ACCESS_TOKEN: "",
    })) {
      expect(() => readProductionDisposableResetConfiguration({
        ...environment,
        [name]: value,
      })).toThrow("Production disposable reset failed");
    }
  });

  it("uses one locked transactional mutation only for the approved residue, then one aggregate verification", async () => {
    const { calls, fetchImpl } = resetFetch();
    const output = [];
    const exactMutationSql = await readFile(resolve(
      root,
      "supabase/reset/production-disposable-reset.sql",
    ), "utf8");

    await expect(runProductionDisposableReset(environment, {
      fetchImpl,
      writeStdout: (value) => output.push(value),
    })).resolves.toEqual(expectedReceipt);

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual([
      `https://api.supabase.com/v1/projects/${productionRef}/database/query`,
      `https://api.supabase.com/v1/projects/${productionRef}/database/query`,
    ]);
    expect(calls.map((call) => call.body.read_only)).toEqual([false, true]);
    expect(calls[0].body.parameters).toEqual([]);
    expect(calls[1].body.parameters).toEqual([]);
    expect(calls[0].body.query).toBe(exactMutationSql);
    expect(calls[0].body.query.trim()).toMatch(/^do \$reset\$[\s\S]*\$reset\$;$/i);
    expect(calls[0].body.query).not.toMatch(/^begin;|\ncommit;|select true as reset_applied/i);
    expect(calls[0].body.query).toContain("pg_advisory_xact_lock");
    expect(calls[0].body.query).toContain("lock table auth.users");
    expect(calls[0].body.query).toContain("public.cohorts");
    expect(calls[0].body.query).toMatch(
      /storage\.objects\s+in share row exclusive mode/,
    );
    expect(calls[0].body.query).toContain("cohorts.group_capacity = 6");
    expect(calls[0].body.query).toContain("groups.group_number between 1 and 5");
    expect(calls[0].body.query).toContain("display_name = 'Group ' || group_number::text");
    expect(calls[0].body.query).toContain("identity_editor_id = null");
    expect(calls[0].body.query).toContain("identity_locked_at = null");
    expect(calls[0].body.query).toContain("image_object_path = null");
    expect(calls[0].body.query).toContain("student_login_credentials') is null");
    expect(calls[0].body.query).toContain("student_login_attempts') is null");
    expect(calls[0].body.query).toMatch(/"other_auth_user_count":\s*1/);
    expect(calls[0].body.query).toMatch(/"cohort_group_join_code_count":\s*24/);
    expect(calls[0].body.query).toMatch(/"student_join_request_count":\s*1/);
    expect(calls[0].body.query).toMatch(/"group_identity_receipt_count":\s*1/);
    expect(calls[0].body.query).toContain("delete from public.cohort_group_join_codes");
    expect(calls[0].body.query).toContain("delete from public.cohort_join_windows");
    expect(calls[0].body.query).toContain("delete from public.audit_events");
    expect(calls[0].body.query).toContain("delete from private.join_attempts");
    expect(calls[0].body.query).toContain("delete from private.group_identity_receipts");
    expect(calls[0].body.query).toContain("delete from public.cohorts");
    expect(calls[0].body.query).toContain("delete from auth.users");
    expect(calls[0].body.query).not.toContain("delete from public.groups");
    expect(calls[0].body.query).not.toContain("delete from auth.sessions");
    expect(calls[0].body.query).not.toContain("delete from storage.objects");
    expect(calls[0].body.query.indexOf("delete from public.cohort_group_join_codes"))
      .toBeLessThan(calls[0].body.query.indexOf("delete from public.cohort_join_windows"));
    expect(calls[0].body.query.indexOf("delete from public.cohorts"))
      .toBeLessThan(calls[0].body.query.indexOf("delete from auth.users"));
    expect(calls[1].body.query).toContain("raw_app_meta_data ->> 'bootstrapAuthorizationId'");
    expect(output).toEqual([`${JSON.stringify(expectedReceipt)}\n`]);
  });

  it("ignores an opaque mutation body after a successful HTTP status", async () => {
    const { calls, fetchImpl } = resetFetch({
      mutationResponse: response("not-json", { raw: true }),
    });
    await expect(runProductionDisposableReset(environment, {
      fetchImpl,
      writeStdout: () => {},
    }))
      .resolves.toEqual(expectedReceipt);
    expect(calls).toHaveLength(2);
    expect(calls[1].body.read_only).toBe(true);
  });

  it.each([
    ["a non-OK provider response", response({ provider: "secret" }, { status: 500 })],
    ["a lost mutation response", new Error("provider secret")],
  ])("verifies canonical state but rejects after %s", async (_name, mutationResponse) => {
    const { calls, fetchImpl } = resetFetch({ mutationResponse });
    const output = [];
    await expect(runProductionDisposableReset(environment, {
      fetchImpl,
      writeStdout: (value) => output.push(value),
    }))
      .rejects.toThrow("Production disposable reset failed");
    expect(calls).toHaveLength(3);
    expect(calls.slice(1).map((call) => call.body.read_only)).toEqual([
      true,
      true,
    ]);
    expect(calls[1].body.query).toContain("canonical_group_number_shape_ready");
    expect(calls[1].body.query).toContain(
      "noncanonical_group_identity_without_receipt_count",
    );
    expect(calls[1].body.query).toContain(
      "group_identity_receipt_outside_canonical_count",
    );
    expect(output).toEqual([
      `${JSON.stringify(expectedDiagnosticReceipt)}\n`,
    ]);
  });

  it("never logs provider bodies, thrown values, credentials, identifiers, names, codes, or receipt payloads on mutation failure", async () => {
    const unsafeValues = [
      accessToken,
      "private-provider-detail",
      "student@example.invalid",
      "Student Private Name",
      "GROUP-CODE-SECRET",
      "00000000-0000-4000-8000-000000000001",
      "receipt-payload-secret",
    ];
    const mutationResponse = response({
      provider: unsafeValues,
      raw: { payload: "receipt-payload-secret" },
    }, { status: 500 });
    const { fetchImpl } = resetFetch({ mutationResponse });
    const output = [];

    await expect(runProductionDisposableReset(environment, {
      fetchImpl,
      writeStdout: (value) => output.push(value),
    })).rejects.toThrow("Production disposable reset failed");

    const serializedOutput = output.join("");
    expect(serializedOutput).toBe(`${JSON.stringify(expectedDiagnosticReceipt)}\n`);
    for (const unsafeValue of unsafeValues) {
      expect(serializedOutput).not.toContain(unsafeValue);
    }
    expect(Object.values(JSON.parse(serializedOutput)).every(
      (value) => typeof value === "boolean" || Number.isInteger(value),
    )).toBe(true);
  });

  it.each([
    ["a non-OK diagnostic response", response({ provider: "secret" }, { status: 500 })],
    ["a malformed diagnostic response", response([{ ...safeDiagnostic, leaked: "secret" }])],
    ["a diagnostic network failure", new Error("provider diagnostic secret")],
  ])("fails closed without output after %s", async (_name, diagnosticResponse) => {
    const { fetchImpl } = resetFetch({
      mutationResponse: response({ provider: "secret" }, { status: 500 }),
      diagnosticResponse,
    });
    const output = [];
    await expect(runProductionDisposableReset(environment, {
      fetchImpl,
      writeStdout: (value) => output.push(value),
    })).rejects.toThrow("Production disposable reset failed");
    expect(output).toEqual([]);
  });

  it("rejects a final aggregate that does not preserve the canonical teacher and five groups", async () => {
    const { fetchImpl } = resetFetch({
      verificationResponse: response([{
        ...canonicalAfter,
        production_classroom_group_count: 4,
      }]),
    });
    await expect(runProductionDisposableReset(environment, { fetchImpl }))
      .rejects.toThrow("Production disposable reset failed");
  });

  it.each([
    ["non-OK verification response", response({ provider: "secret" }, { status: 500 })],
    ["network verification failure", new Error("provider secret")],
    ["malformed verification result", response([{ ...canonicalAfter, unexpected: 1 }])],
  ])("reports %s with one generic redacted error", async (_name, verificationResponse) => {
    const { fetchImpl } = resetFetch({ verificationResponse });
    await expect(runProductionDisposableReset(environment, { fetchImpl }))
      .rejects.toThrow("Production disposable reset failed");
    const retry = resetFetch({ verificationResponse }).fetchImpl;
    await expect(runProductionDisposableReset(environment, { fetchImpl: retry }))
      .rejects.not.toThrow(/provider secret|management-token-value/);
  });

  it("requires the exact main-only protected workflow with pinned actions and only the management token", async () => {
    const workflow = load(await readFile(resolve(
      root,
      ".github/workflows/production-disposable-reset.yml",
    ), "utf8"));
    const serialized = JSON.stringify(workflow);
    const job = workflow.jobs.reset;
    const identityStep = job.steps[0];

    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(job.environment).toBe("production-backend");
    expect(job.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency.group).toBe("campus-quest-production-backend");
    expect(job.env).toEqual({
      PRODUCTION_SUPABASE_PROJECT_REF: "${{ inputs.production_project_ref }}",
      LOAD_SUPABASE_PROJECT_REF: "${{ vars.LOAD_SUPABASE_PROJECT_REF }}",
      RESET_AUTHORIZATION_ID: "${{ inputs.reset_authorization_id }}",
    });
    expect(identityStep.name).toBe("Validate exact approved production reset");
    expect(identityStep.env).toEqual({ EXPECTED_SHA: "${{ inputs.expected_sha }}" });
    expect(identityStep.run.trim().split("\n").map((line) => line.trim()))
      .toEqual(identityCommands);
    expect(serialized).toContain("^[0-9a-f]{40}$");
    expect(serialized).toContain(productionRef);
    expect(serialized).toContain(loadRef);
    expect(serialized).toContain(authorizationId);
    expect(serialized).toContain("pnpm install --frozen-lockfile");
    for (const command of ["check:repo", "check:deployment", "lint", "typecheck", "test", "test:functions"]) {
      expect(serialized).toContain(command);
    }
    expect(serialized).toContain("scripts/production-disposable-reset.mjs");
    expect(serialized).toContain("SUPABASE_ACCESS_TOKEN");
    expect(serialized).not.toMatch(/upload-artifact|download-artifact|PRODUCTION_SUPABASE_SECRET_KEY|PRODUCTION_SUPABASE_DB_PASSWORD|LOAD_SUPABASE_SECRET_KEY|SERVICE_ROLE|ANON_KEY/i);
    for (const step of job.steps) {
      if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    }
    expect(() => validateProductionDisposableResetConfiguration(workflow))
      .not.toThrow();
  });

  it.each([
    ["a non-main condition", (workflow) => {
      workflow.jobs.reset.if = "github.ref == 'refs/heads/release'";
    }],
    ["an unsafe mutation secret", (workflow) => {
      workflow.jobs.reset.steps.at(-1).env.PRODUCTION_SUPABASE_SECRET_KEY =
        "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}";
    }],
    ["an artifact step", (workflow) => {
      workflow.jobs.reset.steps.push({ uses: "actions/upload-artifact@f4b343c5c9c4a5c73b1d4c5f5b89c8d3263a7b5f" });
    }],
    ["an unpinned action", (workflow) => {
      workflow.jobs.reset.steps[1].uses = "actions/checkout@v6";
    }],
    ["the identity step name", (workflow) => {
      workflow.jobs.reset.steps[0].name = "Validate something";
    }],
    ["the expected SHA input mapping", (workflow) => {
      workflow.jobs.reset.steps[0].env.EXPECTED_SHA = "${{ github.sha }}";
    }],
    ["the production input mapping", (workflow) => {
      workflow.jobs.reset.env.PRODUCTION_SUPABASE_PROJECT_REF =
        "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}";
    }],
    ["the load variable mapping", (workflow) => {
      workflow.jobs.reset.env.LOAD_SUPABASE_PROJECT_REF =
        "${{ inputs.production_project_ref }}";
    }],
    ["the authorization input mapping", (workflow) => {
      workflow.jobs.reset.env.RESET_AUTHORIZATION_ID = "${{ github.run_id }}";
    }],
  ])("rejects workflow protection drift: %s", async (_label, mutate) => {
    const workflow = load(await readFile(resolve(
      root,
      ".github/workflows/production-disposable-reset.yml",
    ), "utf8"));
    mutate(workflow);
    expect(() => validateProductionDisposableResetConfiguration(workflow)).toThrow(
      /deployment configuration invalid/i,
    );
  });

  it.each(identityCommands.map((command) => [command]))(
    "rejects removing identity guard: %s",
    async (command) => {
      const workflow = load(await readFile(resolve(
        root,
        ".github/workflows/production-disposable-reset.yml",
      ), "utf8"));
      workflow.jobs.reset.steps[0].run = workflow.jobs.reset.steps[0].run
        .split("\n")
        .filter((line) => line.trim() !== command)
        .join("\n");
      expect(() => validateProductionDisposableResetConfiguration(workflow))
        .toThrow(/deployment configuration invalid/i);
    },
  );
});
