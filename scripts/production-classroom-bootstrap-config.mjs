const PRODUCTION_PROJECT_REF = "ghohuwwjxgjqnbsauvzq";
const LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const AUTHORIZATION_ID = "course-owner-2026-08-08";
const RECEIPT_PATH = "/tmp/campus-quest-classroom-bootstrap.json";
const PINNED_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`Production classroom bootstrap invalid: ${message}`);
}

function environmentName(job) {
  return typeof job?.environment === "string"
    ? job.environment
    : job?.environment?.name;
}

function combinedRuns(job) {
  return (job?.steps ?? [])
    .map((step) => String(step?.run ?? ""))
    .join("\n");
}

export function validateProductionClassroomBootstrapConfiguration(workflow) {
  const inputs = workflow?.on?.workflow_dispatch?.inputs ?? {};
  for (const name of [
    "expected_sha",
    "production_project_ref",
    "retention_days",
    "bootstrap_authorization_id",
  ]) {
    if (inputs[name]?.required !== true) fail(`required input ${name}`);
  }

  const job = workflow?.jobs?.bootstrap;
  if (!job) fail("bootstrap job is missing");
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
      "${{ vars.LOAD_SUPABASE_PROJECT_REF }}" ||
    job?.env?.PRODUCTION_RETENTION_DAYS !== "${{ inputs.retention_days }}" ||
    job?.env?.BOOTSTRAP_AUTHORIZATION_ID !==
      "${{ inputs.bootstrap_authorization_id }}"
  ) {
    fail("exact production project and authorization mappings are required");
  }

  const serialized = JSON.stringify(workflow);
  if (/PRODUCTION_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(serialized)) {
    fail("legacy service-role credentials are forbidden");
  }
  if (/upload-artifact|upload-pages-artifact|download-artifact/i.test(serialized)) {
    fail("bootstrap material must never be stored as an artifact");
  }
  for (const step of job.steps ?? []) {
    if (step?.uses && !PINNED_ACTION.test(step.uses)) {
      fail(`action must be pinned to a full commit SHA: ${step.uses}`);
    }
  }

  const identityIndex = job.steps.findIndex(
    (step) => step?.name === "Validate protected bootstrap identity",
  );
  const verifyIndex = job.steps.findIndex(
    (step) => step?.name === "Reverify protected bootstrap source",
  );
  const bootstrapIndex = job.steps.findIndex(
    (step) => step?.name === "Bootstrap the closed production classroom",
  );
  const receiptIndex = job.steps.findIndex(
    (step) => step?.name === "Record the opaque bootstrap receipt",
  );
  const cleanupIndex = job.steps.findIndex(
    (step) => step?.name === "Remove temporary bootstrap receipt",
  );
  if (identityIndex < 0 || verifyIndex < 0 || bootstrapIndex < 0) {
    fail("identity, verification, and bootstrap steps are required");
  }
  if (!(identityIndex < verifyIndex && verifyIndex < bootstrapIndex)) {
    fail("source verification must precede bootstrap mutation");
  }
  if (!(bootstrapIndex < receiptIndex && receiptIndex < cleanupIndex)) {
    fail("receipt and cleanup order is required");
  }

  const identityRun = String(job.steps[identityIndex].run ?? "");
  const identityLines = identityRun.split("\n").map((line) => line.trim());
  for (const line of [
    'test "$EXPECTED_SHA" = "$GITHUB_SHA"',
    'test "$CONFIRMED_PROJECT_REF" = "$PRODUCTION_SUPABASE_PROJECT_REF"',
    `test "$CONFIRMED_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
    `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${PRODUCTION_PROJECT_REF}"`,
    `test "$LOAD_SUPABASE_PROJECT_REF" = "${LOAD_PROJECT_REF}"`,
    `test "$PRODUCTION_SUPABASE_URL" = "${PRODUCTION_URL}"`,
    'test "$PRODUCTION_SUPABASE_PROJECT_REF" != "$LOAD_SUPABASE_PROJECT_REF"',
    'test "$RETENTION_DAYS" = "90"',
    `test "$AUTHORIZATION_ID" = "${AUTHORIZATION_ID}"`,
  ]) {
    if (!identityLines.includes(line)) fail("identity validation is incomplete");
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

  const bootstrapStep = job.steps[bootstrapIndex];
  if (
    bootstrapStep?.env?.PRODUCTION_SUPABASE_SECRET_KEY !==
      "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}" ||
    bootstrapStep?.env?.SUPABASE_ACCESS_TOKEN !==
      "${{ secrets.SUPABASE_ACCESS_TOKEN }}" ||
    bootstrapStep?.env?.PRODUCTION_TEACHER_EMAIL !==
      "${{ secrets.PRODUCTION_TEACHER_EMAIL }}" ||
    bootstrapStep?.env?.PRODUCTION_TEACHER_PASSWORD !==
      "${{ secrets.PRODUCTION_TEACHER_PASSWORD }}" ||
    String(bootstrapStep?.run ?? "").trim() !==
      `pnpm bootstrap:production-classroom > ${RECEIPT_PATH}`
  ) {
    fail("bootstrap must use only protected modern credentials and receipt path");
  }

  const receiptRun = String(job.steps[receiptIndex]?.run ?? "");
  if (
    !receiptRun.includes(RECEIPT_PATH) ||
    !receiptRun.includes("teacherId") ||
    !receiptRun.includes("cohortId") ||
    !receiptRun.includes("retentionDays") ||
    !receiptRun.includes("groupCount") ||
    !receiptRun.includes("groupCapacity")
  ) {
    fail("opaque receipt validation is incomplete");
  }

  const cleanup = job.steps[cleanupIndex];
  if (
    cleanup?.if !== "always()" ||
    String(cleanup?.run ?? "").trim() !== `rm -f ${RECEIPT_PATH}`
  ) {
    fail("always-run receipt cleanup is required");
  }
  if (/set -x|printenv|env\s*$/m.test(combinedRuns(job))) {
    fail("protected environment printing is forbidden");
  }
}
