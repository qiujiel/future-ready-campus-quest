import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";

const PINNED_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;
const RECOVERY_INPUTS = [
  "backup_evidence_id",
  "backup_created_at_utc",
  "backup_archive_sha256",
  "restore_rehearsal_evidence_id",
];
const RECOVERY_ENVIRONMENT = {
  BACKUP_EVIDENCE_ID: "backup_evidence_id",
  BACKUP_CREATED_AT_UTC: "backup_created_at_utc",
  BACKUP_ARCHIVE_SHA256: "backup_archive_sha256",
  RESTORE_REHEARSAL_EVIDENCE_ID: "restore_rehearsal_evidence_id",
};
const RECOVERY_VALIDATOR_COMMAND = "node scripts/recovery-evidence.mjs";
const RELEASE_CONDITION = "github.ref == 'refs/heads/main'";
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
}

function requireLeastPrivilegeReadiness(job) {
  const serialized = JSON.stringify(job ?? {});
  if (serialized.includes("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY")) {
    fail("production-readiness must not receive a service-role credential");
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

function requireRecoveryEvidenceGate(workflow, validationJob, releaseJob) {
  requireInputs(workflow, RECOVERY_INPUTS);
  if (!needsJob(releaseJob, "validate_recovery_evidence")) {
    fail("backend release requires the recovery evidence dependency");
  }
  if (releaseJob?.if !== RELEASE_CONDITION) {
    fail("backend release must require successful recovery evidence validation");
  }
  if (!validationJob || environmentName(validationJob)) {
    fail("recovery evidence validation must be an unprotected job");
  }
  if (
    Object.prototype.hasOwnProperty.call(
      validationJob,
      "continue-on-error",
    )
  ) {
    fail("recovery evidence validation must be fail-closed");
  }
  requireContentsReadOnly(validationJob, "recovery evidence validation");
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
    fail("recovery evidence validation must not receive a secret");
  }
  const validatorSteps = (validationJob.steps ?? []).filter((step) =>
    String(step?.run ?? "").trim() === RECOVERY_VALIDATOR_COMMAND
  );
  if (validatorSteps.length !== 1) {
    fail("recovery evidence validation must run the repository validator");
  }
  const validatorStep = validatorSteps[0];
  const hasShellOverride = [
    workflow?.defaults?.run,
    validationJob?.defaults?.run,
    validatorStep,
  ].some((scope) => Object.prototype.hasOwnProperty.call(scope ?? {}, "shell"));
  if (hasShellOverride) {
    fail("recovery evidence validation must not use a shell override");
  }
  if (
    Object.prototype.hasOwnProperty.call(validatorStep, "continue-on-error")
  ) {
    fail("recovery evidence validation must be fail-closed");
  }
  if (Object.prototype.hasOwnProperty.call(validatorStep, "if")) {
    fail("recovery evidence validator must run unconditionally");
  }
  const environment = validatorStep.env ?? {};
  for (const [name, input] of Object.entries(RECOVERY_ENVIRONMENT)) {
    if (environment[name] !== `\${{ inputs.${input} }}`) {
      fail(`recovery evidence validation must map ${input}`);
    }
  }
  if (Object.keys(environment).length !== Object.keys(RECOVERY_ENVIRONMENT).length) {
    fail("recovery evidence validation requires exactly four approved environment mappings");
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

export function validateDeploymentConfiguration({ backend, pages, rollback }) {
  const backendJob = backend?.jobs?.release;
  const evidenceJob = backend?.jobs?.validate_recovery_evidence;
  const packageJob = pages?.jobs?.package;
  const preflightJob = pages?.jobs?.preflight;
  const deployJob = pages?.jobs?.deploy;
  const rollbackPrepare = rollback?.jobs?.prepare;
  const rollbackDeploy = rollback?.jobs?.deploy;

  requireInputs(backend, ["expected_sha", "production_project_ref"]);
  requireRecoveryEvidenceGate(backend, evidenceJob, backendJob);
  requireEnvironment(backendJob, "production-backend");
  requireContentsReadOnly(backendJob, "backend release");
  requireBackendReleaseIdentity(backend, backendJob);
  requireRun(backendJob, /migration list/, "backend migration list is missing");
  requireRun(
    backendJob,
    /db push[^\n]*--dry-run/,
    "backend migration dry-run is missing",
  );
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
  const [backend, pages, rollback] = await Promise.all([
    readWorkflow("backend-production.yml"),
    readWorkflow("pages.yml"),
    readWorkflow("pages-rollback.yml"),
  ]);
  return { backend, pages, rollback };
}

async function main() {
  const configuration = await loadDeploymentConfiguration(process.cwd());
  validateDeploymentConfiguration(configuration);
  process.stdout.write("Deployment workflow boundaries passed.\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
