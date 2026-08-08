import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { load } from "js-yaml";
import { validateBootstrapFunctionRepairConfiguration } from
  "./bootstrap-function-repair-config.mjs";
import { validateProductionContentImportConfiguration } from
  "./production-content-import-config.mjs";
import { validateProductionClassroomBootstrapConfiguration } from
  "./production-classroom-bootstrap-config.mjs";

const PINNED_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;
const GITLEAKS_ACTION = "gitleaks/gitleaks-action@v2";
const RELEASE_INPUT_DEFINITIONS = {
  release_mode: {
    description: "Release authorization mode",
    required: true,
    type: "choice",
    default: "upgrade",
    options: ["upgrade", "bootstrap"],
  },
  bootstrap_authorization_id: {
    description: "Redaction-safe bootstrap authorization identifier",
    required: false,
    type: "string",
  },
  backup_evidence_id: {
    description: "Redaction-safe backup evidence identifier",
    required: false,
    type: "string",
  },
  backup_created_at_utc: {
    description: "Redaction-safe UTC backup completion timestamp",
    required: false,
    type: "string",
  },
  backup_archive_sha256: {
    description: "Redaction-safe SHA-256 for the backup archive",
    required: false,
    type: "string",
  },
  restore_rehearsal_evidence_id: {
    description: "Redaction-safe restore rehearsal evidence identifier",
    required: false,
    type: "string",
  },
};
const RELEASE_ENVIRONMENT = {
  RELEASE_MODE: "release_mode",
  BOOTSTRAP_AUTHORIZATION_ID: "bootstrap_authorization_id",
  BACKUP_EVIDENCE_ID: "backup_evidence_id",
  BACKUP_CREATED_AT_UTC: "backup_created_at_utc",
  BACKUP_ARCHIVE_SHA256: "backup_archive_sha256",
  RESTORE_REHEARSAL_EVIDENCE_ID: "restore_rehearsal_evidence_id",
};
const RELEASE_AUTHORIZATION_COMMAND =
  "node scripts/production-release-authorization.mjs";
const RELEASE_AUTHORIZATION_STEPS = [
  {
    name: "Check out the approved source",
    uses: "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09",
    with: {
      ref: "${{ github.sha }}",
      "fetch-depth": 0,
      "persist-credentials": false,
    },
  },
  {
    name: "Set up Node",
    uses: "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
    with: {
      "node-version": 24,
      "package-manager-cache": false,
    },
  },
  {
    name: "Validate redaction-safe release authorization",
    env: Object.fromEntries(
      Object.entries(RELEASE_ENVIRONMENT).map(([name, input]) => [
        name,
        `\${{ inputs.${input} }}`,
      ]),
    ),
    run: RELEASE_AUTHORIZATION_COMMAND,
  },
];
const RELEASE_CONDITION = "github.ref == 'refs/heads/main'";
const RELEASE_AUTHORIZATION_JOB = {
  if: RELEASE_CONDITION,
  "runs-on": "ubuntu-latest",
  "timeout-minutes": 5,
  permissions: { contents: "read" },
  steps: RELEASE_AUTHORIZATION_STEPS,
};
const BOOTSTRAP_PREFLIGHT_STEP = {
  name: "Verify empty production bootstrap state",
  if: "${{ inputs.release_mode == 'bootstrap' }}",
  env: {
    BOOTSTRAP_AUTHORIZATION_ID:
      "${{ inputs.bootstrap_authorization_id }}",
    PRODUCTION_SUPABASE_SECRET_KEY:
      "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}",
    SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
  },
  run: "node scripts/production-bootstrap-preflight.mjs",
};
const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const BACKEND_IDENTITY_SCRIPT = [
  "if ! printf '%s' \"$EXPECTED_SHA\" | grep -Eq '^[0-9a-f]{40}$'; then",
  "  echo \"expected_sha must be a full lowercase commit SHA\" >&2",
  "  exit 1",
  "fi",
  "test \"$EXPECTED_SHA\" = \"$GITHUB_SHA\"",
  "test \"$CONFIRMED_PROJECT_REF\" = \"$PRODUCTION_SUPABASE_PROJECT_REF\"",
  `test "$CONFIRMED_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
  `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
  `test "$LOAD_SUPABASE_PROJECT_REF" = "${LOAD_PROJECT_REF}"`,
  `test "$PRODUCTION_SUPABASE_URL" = "${PRODUCTION_URL}"`,
  "test \"$PRODUCTION_SUPABASE_PROJECT_REF\" != \"$LOAD_SUPABASE_PROJECT_REF\"",
].join("\n");

function fail(message) {
  throw new Error(`Deployment configuration invalid: ${message}`);
}

function environmentName(job) {
  return typeof job?.environment === "string"
    ? job.environment
    : job?.environment?.name;
}

function requireEnvironment(job, expected) {
  if (environmentName(job) !== expected) {
    fail(`expected protected environment ${expected}`);
  }
}

function needsJob(job, expected) {
  const needs = Array.isArray(job?.needs) ? job.needs : [job?.needs];
  return needs.includes(expected);
}

function combinedRuns(job) {
  return (job?.steps ?? [])
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");
}

function requireRun(job, pattern, message) {
  if (!pattern.test(combinedRuns(job))) fail(message);
}

function requireProductionFunctionConfigurationValidation(job) {
  const secretStep = (job?.steps ?? []).find((step) =>
    String(step?.run ?? "").includes("supabase secrets set"),
  );
  const run = String(secretStep?.run ?? "");
  const validationIndex = run.indexOf(
    "node scripts/production-function-config.mjs",
  );
  const secretMutationIndex = run.indexOf("supabase secrets set");
  if (validationIndex < 0 || validationIndex > secretMutationIndex) {
    fail(
      "production Function configuration validation must precede Function secrets",
    );
  }
}

function requireModernProductionFunctionCredentials(job) {
  const step = (job?.steps ?? []).find((candidate) =>
    String(candidate?.run ?? "").includes("supabase secrets set")
  );
  const run = String(step?.run ?? "");
  if (
    job?.env?.PRODUCTION_SUPABASE_PUBLISHABLE_KEY !==
      "${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}" ||
    step?.env?.PRODUCTION_SUPABASE_SECRET_KEY !==
      "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}" ||
    !run.includes(
      "FRCQ_SUPABASE_PUBLISHABLE_KEY=$PRODUCTION_SUPABASE_PUBLISHABLE_KEY",
    ) ||
    !run.includes("FRCQ_SUPABASE_SECRET_KEY=$PRODUCTION_SUPABASE_SECRET_KEY")
  ) {
    fail("production deployment requires modern Function credentials");
  }
}

function requireEdgeReadyWait(job, label) {
  const runs = combinedRuns(job);
  if (
    !/%\{http_code\}/.test(runs) ||
    !/Origin:/.test(runs) ||
    !/join-cohort/.test(runs) ||
    !/recover-student/.test(runs) ||
    !/response_code[\s\S]*405|405[\s\S]*response_code/.test(runs)
  ) {
    fail(
      `${label} Edge readiness must require the join and recovery 405 responses`,
    );
  }
}

function requireFrozenDenoCheck(job, label) {
  const runs = combinedRuns(job);
  if (
    !/deno check[^\n]*--frozen/.test(runs) ||
    !/--config supabase\/functions\/deno\.json/.test(runs) ||
    !/--lock supabase\/functions\/deno\.lock/.test(runs)
  ) {
    fail(`${label} must check the committed frozen Deno dependency graph`);
  }
}

function requireDedicatedLiveLoad(job) {
  const step = (job?.steps ?? []).find((candidate) =>
    String(candidate?.run ?? "").includes("test:load:live")
  );
  if (!step?.env?.LOAD_SUPABASE_PROJECT_REF) {
    fail("Pages live load gate requires the dedicated load project ref");
  }
  if (environmentName(job) !== "load-test") {
    fail("Pages live load gate requires the protected load-test environment");
  }
  const serialized = JSON.stringify(step?.env ?? {});
  if (
    !step?.env?.LOAD_SUPABASE_PUBLISHABLE_KEY ||
    !step?.env?.LOAD_SUPABASE_SECRET_KEY ||
    serialized.includes("LOAD_SUPABASE_SERVICE_ROLE_KEY") ||
    serialized.includes("LOAD_TEACHER_ACCESS_TOKEN") ||
    serialized.includes("LOAD_JOIN_TOKEN") ||
    serialized.includes("LOAD_COHORT_ID") ||
    serialized.includes("LOAD_CONTENT_VERSION_ID")
  ) {
    fail(
      "Pages live load requires an ephemeral load fixture and modern secret key",
    );
  }
}

function requireLeastPrivilegeReadiness(job) {
  const serialized = JSON.stringify(job ?? {});
  if (
    serialized.includes("PRODUCTION_SUPABASE_SECRET_KEY") ||
    serialized.includes("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY")
  ) {
    fail("production-readiness must not receive a privileged Supabase credential");
  }
  if (!serialized.includes("PRODUCTION_READINESS_SECRET")) {
    fail("production-readiness requires its dedicated readiness secret");
  }
}

function workflowDispatchInputs(workflow) {
  return workflow?.on?.workflow_dispatch?.inputs ?? {};
}

function requireInputs(workflow, names) {
  const inputs = workflowDispatchInputs(workflow);
  for (const name of names) {
    if (inputs[name]?.required !== true) fail(`required workflow input ${name}`);
  }
}

function requireCanonicalReleaseInputs(workflow) {
  const inputs = workflowDispatchInputs(workflow);
  for (const [name, definition] of Object.entries(
    RELEASE_INPUT_DEFINITIONS,
  )) {
    if (!isDeepStrictEqual(inputs[name], definition)) {
      fail(`canonical release workflow input ${name}`);
    }
  }
}

function containsSecretsContext(value) {
  const source = JSON.stringify(value ?? {});
  let expressionStart = source.indexOf("${{");
  while (expressionStart >= 0) {
    let cursor = expressionStart + 3;
    let inString = false;
    let unquotedExpression = "";
    while (cursor < source.length - 1) {
      if (source[cursor] === "'") {
        if (inString && source[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        inString = !inString;
        unquotedExpression += " ";
        cursor += 1;
        continue;
      }
      if (!inString && source.slice(cursor, cursor + 2) === "}}") {
        if (/\bsecrets\b/i.test(unquotedExpression)) return true;
        expressionStart = source.indexOf("${{", cursor + 2);
        break;
      }
      if (!inString) unquotedExpression += source[cursor];
      cursor += 1;
    }
    if (cursor >= source.length - 1) return false;
  }
  return false;
}

function directRunLines(step) {
  return String(step?.run ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function requireDirectRunLine(step, line, message) {
  if (!directRunLines(step).includes(line)) fail(message);
}

function requireReleaseAuthorizationGate(workflow, validationJob, releaseJob) {
  requireCanonicalReleaseInputs(workflow);
  if (!needsJob(releaseJob, "validate_release_authorization")) {
    fail("backend release requires the release authorization dependency");
  }
  if (releaseJob?.if !== RELEASE_CONDITION) {
    fail("backend release must require successful release authorization validation");
  }
  if (!validationJob || environmentName(validationJob)) {
    fail("release authorization validation must be an unprotected job");
  }
  if (
    Object.prototype.hasOwnProperty.call(
      validationJob,
      "continue-on-error",
    )
  ) {
    fail("release authorization validation must be fail-closed");
  }
  requireContentsReadOnly(validationJob, "release authorization validation");
  const secretEligibleMaterial = [
    workflow?.env,
    validationJob?.env,
    validationJob?.defaults,
    ...(validationJob?.steps ?? []).map((step) => ({
      env: step?.env,
      run: step?.run,
      with: step?.with,
      shell: step?.shell,
    })),
  ];
  if (secretEligibleMaterial.some(containsSecretsContext)) {
    fail("release authorization validation must not receive a secret");
  }
  const validatorSteps = (validationJob.steps ?? []).filter((step) =>
    String(step?.run ?? "").trim() === RELEASE_AUTHORIZATION_COMMAND
  );
  if (validatorSteps.length !== 1) {
    fail("release authorization validation must run the repository validator");
  }
  const validatorStep = validatorSteps[0];
  const hasShellOverride = [
    workflow?.defaults?.run,
    validationJob?.defaults?.run,
    validatorStep,
  ].some((scope) => Object.prototype.hasOwnProperty.call(scope ?? {}, "shell"));
  if (hasShellOverride) {
    fail("release authorization validation must not use a shell override");
  }
  if (
    [
      workflow?.env,
      workflow?.defaults,
      validationJob?.env,
      validationJob?.defaults,
    ].some((value) => value !== undefined)
  ) {
    fail("release authorization validation must not inherit execution overrides");
  }
  if (
    Object.prototype.hasOwnProperty.call(validatorStep, "continue-on-error")
  ) {
    fail("release authorization validation must be fail-closed");
  }
  if (Object.prototype.hasOwnProperty.call(validatorStep, "if")) {
    fail("release authorization validator must run unconditionally");
  }
  const environment = validatorStep.env ?? {};
  for (const [name, input] of Object.entries(RELEASE_ENVIRONMENT)) {
    if (environment[name] !== `\${{ inputs.${input} }}`) {
      fail(`release authorization validation must map ${input}`);
    }
  }
  if (Object.keys(environment).length !== Object.keys(RELEASE_ENVIRONMENT).length) {
    fail("release authorization validation requires exactly six approved environment mappings");
  }
  if (!isDeepStrictEqual(validationJob.steps, RELEASE_AUTHORIZATION_STEPS)) {
    fail("release authorization validation requires canonical ordered evidence steps");
  }
  if (!isDeepStrictEqual(validationJob, RELEASE_AUTHORIZATION_JOB)) {
    fail("release authorization validation requires the canonical evidence job");
  }
}

function requireBootstrapPreflightOrder(job) {
  const steps = job?.steps ?? [];
  const preflightSteps = steps.filter((step) =>
    step?.name === BOOTSTRAP_PREFLIGHT_STEP.name ||
    String(step?.run ?? "").includes("production-bootstrap-preflight.mjs")
  );
  if (
    preflightSteps.length !== 1 ||
    !isDeepStrictEqual(preflightSteps[0], BOOTSTRAP_PREFLIGHT_STEP)
  ) {
    fail("backend release requires the canonical bootstrap preflight");
  }

  if (
    job?.env?.RELEASE_MODE !== "${{ inputs.release_mode }}" ||
    job?.env?.BOOTSTRAP_AUTHORIZATION_ID !==
      "${{ inputs.bootstrap_authorization_id }}"
  ) {
    fail("backend release requires canonical bootstrap release mappings");
  }

  const indexOfRun = (predicate) =>
    steps.findIndex((step) => predicate(String(step?.run ?? "")));
  const linkIndex = steps.findIndex(
    (step) => step?.name === "Link the confirmed production project",
  );
  const bootstrapIndex = steps.indexOf(preflightSteps[0]);
  const migrationListIndex = indexOfRun((run) => run.includes("migration list"));
  const dryRunIndex = indexOfRun(
    (run) => run.includes("db push") && run.includes("--dry-run"),
  );
  const migrationApplyIndex = indexOfRun(
    (run) => run.includes("db push") && !run.includes("--dry-run"),
  );
  const secretsIndex = indexOfRun((run) => run.includes("supabase secrets set"));
  const functionsIndex = indexOfRun((run) =>
    run.includes("supabase functions deploy")
  );
  const requiredIndices = [
    linkIndex,
    bootstrapIndex,
    migrationListIndex,
    dryRunIndex,
    migrationApplyIndex,
    secretsIndex,
    functionsIndex,
  ];
  if (
    requiredIndices.some((index) => index < 0) ||
    !(linkIndex < bootstrapIndex) ||
    !(bootstrapIndex < migrationListIndex) ||
    !(bootstrapIndex < dryRunIndex) ||
    !(migrationListIndex < migrationApplyIndex) ||
    !(dryRunIndex < migrationApplyIndex) ||
    !(migrationApplyIndex < secretsIndex) ||
    !(secretsIndex < functionsIndex)
  ) {
    fail(
      "bootstrap preflight must run after linking and before production mutations",
    );
  }
}

function requireBackendReleaseIdentity(workflow, job) {
  const steps = job?.steps ?? [];
  const identityIndex = steps.findIndex((step) =>
    step?.name === "Validate protected release identity"
  );
  if (identityIndex < 0) fail("backend release requires protected identity validation");

  const identityStep = steps[identityIndex];
  const hasShellOverride = [
    workflow?.defaults?.run,
    job?.defaults?.run,
    identityStep,
  ].some((scope) => Object.prototype.hasOwnProperty.call(scope ?? {}, "shell"));
  const continueOnError = identityStep?.["continue-on-error"];
  if (
    hasShellOverride ||
    (continueOnError !== undefined && continueOnError !== false)
  ) {
    fail("backend release must use canonical fail-closed identity execution");
  }
  if (
    identityStep?.env?.CONFIRMED_PROJECT_REF !==
      "${{ inputs.production_project_ref }}"
  ) {
    fail("backend release must map the confirmed production project input");
  }
  if (
    job?.env?.PRODUCTION_SUPABASE_PROJECT_REF !==
      "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}" ||
    job?.env?.LOAD_SUPABASE_PROJECT_REF !==
      "${{ vars.LOAD_SUPABASE_PROJECT_REF }}" ||
    job?.env?.PRODUCTION_SUPABASE_URL !== "${{ vars.VITE_SUPABASE_URL }}"
  ) {
    fail("backend release must map the protected project identity variables");
  }

  requireDirectRunLine(
    identityStep,
    'test "$CONFIRMED_PROJECT_REF" = "$PRODUCTION_SUPABASE_PROJECT_REF"',
    "backend release must compare the confirmed and configured production project",
  );
  requireDirectRunLine(
    identityStep,
    `test "$CONFIRMED_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
    "backend release must enforce the exact production project input",
  );
  requireDirectRunLine(
    identityStep,
    `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
    "backend release must enforce the exact production project",
  );
  requireDirectRunLine(
    identityStep,
    `test "$LOAD_SUPABASE_PROJECT_REF" = "${LOAD_PROJECT_REF}"`,
    "backend release must enforce the exact load project",
  );
  requireDirectRunLine(
    identityStep,
    `test "$PRODUCTION_SUPABASE_URL" = "${PRODUCTION_URL}"`,
    "backend release must enforce the exact production URL",
  );
  requireDirectRunLine(
    identityStep,
    'test "$PRODUCTION_SUPABASE_PROJECT_REF" != "$LOAD_SUPABASE_PROJECT_REF"',
    "backend release lacks load project separation",
  );
  if (String(identityStep.run ?? "").trim() !== BACKEND_IDENTITY_SCRIPT) {
    fail("backend release must use the canonical fail-closed identity script");
  }

  const productionMutation = /\b(?:pnpm exec )?supabase\s+(?:db\s+push|secrets\s+set|functions\s+deploy)\b/;
  const mutationSteps = steps.filter((step) =>
    productionMutation.test(String(step?.run ?? ""))
  );
  if (mutationSteps.some((step) => step?.if !== undefined)) {
    fail("production mutation must require successful identity validation");
  }
  const mutationBeforeIdentity = steps.slice(0, identityIndex).some((step) =>
    productionMutation.test(String(step?.run ?? ""))
  );
  if (mutationBeforeIdentity) {
    fail("backend identity validation must precede production mutation");
  }
}

function requirePinnedActions(workflows) {
  for (const workflow of workflows) {
    for (const job of Object.values(workflow?.jobs ?? {})) {
      for (const step of job?.steps ?? []) {
        if (typeof step?.uses === "string" && !PINNED_ACTION.test(step.uses)) {
          fail(`action must use a full commit SHA: ${step.uses}`);
        }
      }
    }
  }
}

function requireContentsReadOnly(job, label) {
  const permissions = job?.permissions ?? {};
  if (
    permissions.contents !== "read" ||
    Object.keys(permissions).some((name) => name !== "contents")
  ) {
    fail(`${label} job must use only contents: read permission`);
  }
}

function requirePagesDeployPermissions(job) {
  const permissions = job?.permissions ?? {};
  if (
    permissions.pages !== "write" ||
    permissions["id-token"] !== "write"
  ) {
    fail("Pages deploy job requires pages: write and id-token: write");
  }
}

function requireCiSecretScan(ci) {
  const permissions = ci?.permissions ?? {};
  if (
    permissions.contents !== "read" ||
    permissions["pull-requests"] !== "read" ||
    Object.keys(permissions).some(
      (name) => name !== "contents" && name !== "pull-requests",
    )
  ) {
    fail("CI workflow requires contents and pull-requests read permission");
  }

  const job = ci?.jobs?.secrets;
  if (!job || environmentName(job)) {
    fail("CI secret scan must be an unprotected job");
  }

  const gitleaksSteps = (job.steps ?? []).filter(
    (step) => step?.uses === GITLEAKS_ACTION,
  );
  if (gitleaksSteps.length !== 1) {
    fail("CI requires exactly one Gitleaks secret scan");
  }

  const environment = gitleaksSteps[0].env ?? {};
  if (
    environment.GITHUB_TOKEN !== "${{ secrets.GITHUB_TOKEN }}" ||
    Object.keys(environment).length !== 1
  ) {
    fail("CI Gitleaks scan requires only the automatic GitHub token");
  }
}

export function validateLoadTestBootstrapConfiguration(workflow) {
  const job = workflow?.jobs?.bootstrap;
  const serialized = JSON.stringify(workflow ?? {});
  if (
    environmentName(job) !== "production-backend" ||
    !String(job?.if ?? "").includes("refs/heads/main") ||
    !serialized.includes(LOAD_PROJECT_REF) ||
    !serialized.includes(PRODUCTION_PROJECT_REF) ||
    !serialized.includes("scripts/load-test-bootstrap.mjs") ||
    !serialized.includes("supabase functions deploy") ||
    !serialized.includes("SUPABASE_ACCESS_TOKEN")
  ) {
    fail("load-test bootstrap requires exact identities, main, and protected access");
  }
  if (
    serialized.includes("PRODUCTION_SUPABASE_SECRET_KEY") ||
    serialized.includes("PRODUCTION_SUPABASE_DB_PASSWORD") ||
    serialized.includes("LOAD_SUPABASE_SECRET_KEY")
  ) {
    fail("load-test bootstrap must not receive production or load application keys");
  }
  requireContentsReadOnly(job, "load-test bootstrap");
  requirePinnedActions([workflow]);
}

export function validateProductionClassroomNatFixConfiguration(workflow) {
  const job = workflow?.jobs?.apply_fix;
  const serialized = JSON.stringify(workflow ?? {});
  if (
    environmentName(job) !== "production-backend" ||
    !String(job?.if ?? "").includes("refs/heads/main") ||
    !serialized.includes(PRODUCTION_PROJECT_REF) ||
    !serialized.includes(LOAD_PROJECT_REF) ||
    !serialized.includes("scripts/production-classroom-nat-fix.mjs") ||
    !serialized.includes("SUPABASE_ACCESS_TOKEN")
  ) {
    fail("production NAT fix requires exact identities, main, and protected access");
  }
  if (
    serialized.includes("PRODUCTION_SUPABASE_SECRET_KEY") ||
    serialized.includes("PRODUCTION_SUPABASE_DB_PASSWORD") ||
    serialized.includes("LOAD_SUPABASE_SECRET_KEY")
  ) {
    fail("production NAT fix must not receive application or database keys");
  }
  requireContentsReadOnly(job, "production NAT fix");
  requirePinnedActions([workflow]);
}

export function validateProductionJoinLatencyFixConfiguration(workflow) {
  const job = workflow?.jobs?.deploy_fix;
  const serialized = JSON.stringify(workflow ?? {});
  const runs = combinedRuns(job);
  if (
    environmentName(job) !== "production-backend" ||
    !String(job?.if ?? "").includes("refs/heads/main") ||
    !serialized.includes(PRODUCTION_PROJECT_REF) ||
    !serialized.includes(LOAD_PROJECT_REF) ||
    !serialized.includes("74ca35cf7745a4b559884903c554955caf14efbb") ||
    !runs.includes("functions deploy join-cohort") ||
    !serialized.includes("SUPABASE_ACCESS_TOKEN") ||
    !serialized.includes("PRODUCTION_READINESS_SECRET")
  ) {
    fail("production join fix requires reviewed source and an exact protected target");
  }
  if (
    serialized.includes("PRODUCTION_SUPABASE_SECRET_KEY") ||
    serialized.includes("PRODUCTION_SUPABASE_DB_PASSWORD") ||
    serialized.includes("LOAD_SUPABASE_SECRET_KEY") ||
    /\bdb push\b/.test(runs) ||
    /\bmigration repair\b/.test(runs)
  ) {
    fail("production join fix must not receive application/database keys or mutate schema");
  }
  if (
    !runs.includes("git diff --name-only") ||
    !runs.includes("20260808000300_combined_join_preparation.sql") ||
    !runs.includes("supabase/functions/join-cohort/index.ts") ||
    !runs.includes("supabase/functions/_shared/join-core.ts") ||
    runs.includes("supabase/functions/_shared/session-core.ts")
  ) {
    fail("production join fix must prove exact migration and Function scope");
  }
  requireContentsReadOnly(job, "production join fix");
  requireFrozenDenoCheck(job, "production join fix");
  requirePinnedActions([workflow]);
}

export function validateDeploymentConfiguration({ ci, backend, pages, rollback }) {
  const backendJob = backend?.jobs?.release;
  const authorizationJob = backend?.jobs?.validate_release_authorization;
  const packageJob = pages?.jobs?.package;
  const preflightJob = pages?.jobs?.preflight;
  const deployJob = pages?.jobs?.deploy;
  const rollbackPrepare = rollback?.jobs?.prepare;
  const rollbackDeploy = rollback?.jobs?.deploy;

  requireCiSecretScan(ci);
  requireInputs(backend, ["expected_sha", "production_project_ref"]);
  requireReleaseAuthorizationGate(backend, authorizationJob, backendJob);
  requireEnvironment(backendJob, "production-backend");
  requireContentsReadOnly(backendJob, "backend release");
  requireBackendReleaseIdentity(backend, backendJob);
  requireBootstrapPreflightOrder(backendJob);
  requireRun(backendJob, /migration list/, "backend migration list is missing");
  requireRun(
    backendJob,
    /db push[^\n]*--dry-run/,
    "backend migration dry-run is missing",
  );
  requireProductionFunctionConfigurationValidation(backendJob);
  requireModernProductionFunctionCredentials(backendJob);
  requireRun(backendJob, /secrets set/, "Edge Function secret deployment is missing");
  requireRun(backendJob, /functions deploy/, "Edge Function deployment is missing");
  requireEdgeReadyWait(backendJob, "backend release");
  requireFrozenDenoCheck(backendJob, "backend release");

  requireContentsReadOnly(packageJob, "Pages package");
  requireEdgeReadyWait(packageJob, "Pages package");
  requireFrozenDenoCheck(packageJob, "Pages package");
  requireDedicatedLiveLoad(packageJob);
  requireEnvironment(preflightJob, "production-readiness");
  requireLeastPrivilegeReadiness(preflightJob);
  if (!needsJob(preflightJob, "package")) {
    fail("production-readiness must consume the package job");
  }
  requireEnvironment(deployJob, "github-pages");
  if (!needsJob(deployJob, "preflight")) {
    fail("Pages deployment must need the distinct production-readiness job");
  }
  requirePagesDeployPermissions(deployJob);

  const upload = (packageJob?.steps ?? []).find((step) =>
    String(step?.uses ?? "").startsWith("actions/upload-pages-artifact@")
  );
  if (Number(upload?.with?.["retention-days"]) < 90) {
    fail("Pages artifact must have at least 90-day retention");
  }
  if (!upload?.id) fail("Pages artifact upload must expose an artifact ID");

  requireInputs(rollback, [
    "source_run_id",
    "expected_commit_sha",
    "expected_manifest_digest",
  ]);
  const rollbackPermissions = rollbackPrepare?.permissions ?? {};
  if (
    rollbackPermissions.actions !== "read" ||
    rollbackPermissions.contents !== "read"
  ) {
    fail("rollback preparation requires actions: read and contents: read");
  }
  requireEnvironment(rollbackDeploy, "github-pages");
  if (!needsJob(rollbackDeploy, "prepare")) {
    fail("rollback deploy must consume verified preparation");
  }
  requirePagesDeployPermissions(rollbackDeploy);

  requirePinnedActions([backend, pages, rollback]);
}

export async function loadDeploymentConfiguration(baseDirectory) {
  const workflowDirectory = resolve(baseDirectory, ".github", "workflows");
  const readWorkflow = async (name) =>
    load(await readFile(resolve(workflowDirectory, name), "utf8"));
  const [
    ci,
    backend,
    pages,
    rollback,
    bootstrapFunctionRepair,
    productionContentImport,
    productionClassroomBootstrap,
    loadTestBootstrap,
    productionClassroomNatFix,
    productionJoinLatencyFix,
  ] = await Promise.all([
    readWorkflow("ci.yml"),
    readWorkflow("backend-production.yml"),
    readWorkflow("pages.yml"),
    readWorkflow("pages-rollback.yml"),
    readWorkflow("bootstrap-function-repair.yml"),
    readWorkflow("production-content-import.yml"),
    readWorkflow("production-classroom-bootstrap.yml"),
    readWorkflow("load-test-bootstrap.yml"),
    readWorkflow("production-classroom-nat-fix.yml"),
    readWorkflow("production-join-latency-fix.yml"),
  ]);
  return {
    ci,
    backend,
    pages,
    rollback,
    bootstrapFunctionRepair,
    productionContentImport,
    productionClassroomBootstrap,
    loadTestBootstrap,
    productionClassroomNatFix,
    productionJoinLatencyFix,
  };
}

async function main() {
  const configuration = await loadDeploymentConfiguration(process.cwd());
  validateDeploymentConfiguration(configuration);
  validateBootstrapFunctionRepairConfiguration(
    configuration.bootstrapFunctionRepair,
  );
  validateProductionContentImportConfiguration(
    configuration.productionContentImport,
  );
  validateProductionClassroomBootstrapConfiguration(
    configuration.productionClassroomBootstrap,
  );
  validateLoadTestBootstrapConfiguration(configuration.loadTestBootstrap);
  validateProductionClassroomNatFixConfiguration(
    configuration.productionClassroomNatFix,
  );
  validateProductionJoinLatencyFixConfiguration(
    configuration.productionJoinLatencyFix,
  );
  process.stdout.write("Deployment workflow boundaries passed.\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
