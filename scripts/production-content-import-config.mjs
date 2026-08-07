const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const CONTENT_PATH = "/tmp/campus-quest-protected-content.json";
const PINNED_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`Production content import invalid: ${message}`);
}

function environmentName(job) {
  return typeof job?.environment === "string"
    ? job.environment
    : job?.environment?.name;
}

function runs(job) {
  return (job?.steps ?? [])
    .map((step) => String(step?.run ?? ""))
    .join("\n");
}

export function validateProductionContentImportConfiguration(workflow) {
  const inputs = workflow?.on?.workflow_dispatch?.inputs ?? {};
  for (const name of [
    "expected_sha",
    "production_project_ref",
    "expected_content_version",
  ]) {
    if (inputs[name]?.required !== true) fail(`required input ${name}`);
  }

  const job = workflow?.jobs?.import;
  if (!job) fail("import job is missing");
  if (job.if !== "github.ref == 'refs/heads/main'") {
    fail("workflow must be main-only");
  }
  if (environmentName(job) !== "production-backend") {
    fail("protected production-backend approval is required");
  }
  if (
    job?.permissions?.contents !== "read" ||
    Object.keys(job?.permissions ?? {}).length !== 1
  ) {
    fail("job must use only contents: read permission");
  }
  if (
    job?.env?.PRODUCTION_SUPABASE_PROJECT_REF !==
      "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}" ||
    job?.env?.PRODUCTION_SUPABASE_URL !== "${{ vars.VITE_SUPABASE_URL }}" ||
    job?.env?.LOAD_SUPABASE_PROJECT_REF !==
      "${{ vars.LOAD_SUPABASE_PROJECT_REF }}"
  ) {
    fail("exact production project variables are required");
  }

  const serialized = JSON.stringify(workflow);
  if (/PRODUCTION_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(serialized)) {
    fail("legacy service-role credentials are forbidden");
  }
  if (/upload-artifact|upload-pages-artifact|download-artifact/i.test(serialized)) {
    fail("protected content must never be stored as an artifact");
  }

  for (const step of job.steps ?? []) {
    if (step?.uses && !PINNED_ACTION.test(step.uses)) {
      fail(`action must be pinned to a full commit SHA: ${step.uses}`);
    }
  }

  const identityIndex = job.steps.findIndex(
    (step) => step?.name === "Validate protected import identity",
  );
  const materializeIndex = job.steps.findIndex(
    (step) => step?.name === "Materialize encrypted protected content",
  );
  const importIndex = job.steps.findIndex(
    (step) => step?.name === "Import the approved content version",
  );
  const cleanupIndex = job.steps.findIndex(
    (step) => step?.name === "Remove temporary protected content",
  );
  if (
    identityIndex < 0 || materializeIndex < 0 || importIndex < 0 ||
    cleanupIndex < 0 || !(identityIndex < materializeIndex) ||
    !(materializeIndex < importIndex) || !(importIndex < cleanupIndex)
  ) {
    fail("identity, materialization, import, and cleanup order is required");
  }

  const identity = job.steps[identityIndex];
  const identityRun = String(identity.run ?? "");
  for (const requiredLine of [
    'test "$EXPECTED_SHA" = "$GITHUB_SHA"',
    'test "$CONFIRMED_PROJECT_REF" = "$PRODUCTION_SUPABASE_PROJECT_REF"',
    `test "$CONFIRMED_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
    `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
    `test "$LOAD_SUPABASE_PROJECT_REF" = "${LOAD_PROJECT_REF}"`,
    `test "$PRODUCTION_SUPABASE_URL" = "${PRODUCTION_URL}"`,
    'test "$PRODUCTION_SUPABASE_PROJECT_REF" != "$LOAD_SUPABASE_PROJECT_REF"',
    'test "$EXPECTED_CONTENT_VERSION" = "2026-07-30-approved-blueprint-v1"',
  ]) {
    if (!identityRun.split("\n").map((line) => line.trim()).includes(requiredLine)) {
      fail("identity validation is incomplete");
    }
  }

  const checkout = job.steps.find((step) =>
    String(step?.uses ?? "").startsWith("actions/checkout@")
  );
  if (
    checkout?.with?.ref !== "${{ github.sha }}" ||
    checkout?.with?.["persist-credentials"] !== false
  ) {
    fail("checkout must use the immutable SHA without persisted credentials");
  }

  const materialize = job.steps[materializeIndex];
  const materializeRun = String(materialize.run ?? "");
  if (
    materialize?.env?.PROTECTED_CONTENT_BANK_JSON !==
      "${{ secrets.PROTECTED_CONTENT_BANK_JSON }}" ||
    !materializeRun.includes("umask 077") ||
    !materializeRun.includes(
      `printf '%s' "$PROTECTED_CONTENT_BANK_JSON" > ${CONTENT_PATH}`,
    ) ||
    /\b(?:cat|echo)\b/.test(materializeRun)
  ) {
    fail("encrypted content must be materialized privately without logging");
  }

  const importStep = job.steps[importIndex];
  const importRun = String(importStep.run ?? "");
  if (
    importStep?.env?.SUPABASE_SECRET_KEY !==
      "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}" ||
    importStep?.env?.EXPECTED_CONTENT_VERSION !==
      "${{ inputs.expected_content_version }}" ||
    !importRun.includes(`pnpm import:protected-content -- ${CONTENT_PATH}`) ||
    !importRun.includes(
      '--confirm-project-ref="$PRODUCTION_SUPABASE_PROJECT_REF"',
    ) ||
    !importRun.includes('--expected-content-version="$EXPECTED_CONTENT_VERSION"')
  ) {
    fail("import must use the modern secret and exact target/version guards");
  }

  const cleanup = job.steps[cleanupIndex];
  if (
    cleanup?.if !== "always()" ||
    String(cleanup?.run ?? "").trim() !== `rm -f ${CONTENT_PATH}`
  ) {
    fail("temporary protected content must always be removed");
  }

  if (/set -x|printenv|env\s*$/m.test(runs(job))) {
    fail("workflow must not print its protected environment");
  }
}
