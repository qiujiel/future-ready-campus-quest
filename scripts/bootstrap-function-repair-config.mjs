const PINNED_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;
const FAILED_RUN_ID = "31188390434";
const FAILED_SHA = "f6bb71f61b9f28341542876135bc6cd6b4e19302";

function fail(message) {
  throw new Error(`Bootstrap Function repair invalid: ${message}`);
}

export function validateBootstrapFunctionRepairConfiguration(workflow) {
  const inputs = workflow?.on?.workflow_dispatch?.inputs ?? {};
  for (const name of [
    "expected_sha",
    "production_project_ref",
    "failed_source_run_id",
  ]) {
    if (inputs[name]?.required !== true) fail(`required input ${name}`);
  }

  const job = workflow?.jobs?.repair;
  if (job?.if !== "github.ref == 'refs/heads/main'") fail("main-only condition");
  if (job?.environment !== "production-backend") {
    fail("repair requires production-backend");
  }
  if (job?.permissions?.contents !== "read" || Object.keys(job.permissions).length !== 1) {
    fail("repair permissions must be contents: read only");
  }

  const steps = job?.steps ?? [];
  for (const step of steps) {
    if (typeof step?.uses === "string" && !PINNED_ACTION.test(step.uses)) {
      fail(`action must be pinned: ${step.uses}`);
    }
  }
  const runs = steps.map((step) => String(step?.run ?? "")).join("\n");
  if (/supabase\s+(?:db\s+(?:push|reset)|migration\s+repair)|import:protected-content/i.test(runs)) {
    fail("database or content mutation is forbidden");
  }

  const identity = steps.find((step) =>
    step?.name === "Validate one-time repair identity"
  );
  const identityRun = String(identity?.run ?? "");
  if (
    !identityRun.includes(`test "$FAILED_SOURCE_RUN_ID" = "${FAILED_RUN_ID}"`) ||
    !identityRun.includes('test "$EXPECTED_SHA" = "$GITHUB_SHA"') ||
    !identityRun.includes('test "$CONFIRMED_PROJECT_REF" = "ghohuwwjxgjqnbsauvzq"')
  ) {
    fail("repair must bind the failed bootstrap run and production identity");
  }
  if (!runs.includes(`git diff --exit-code ${FAILED_SHA} "$GITHUB_SHA" -- supabase/migrations`)) {
    fail("repair must prove migrations are unchanged");
  }

  const secretStep = steps.find((step) =>
    String(step?.run ?? "").includes("supabase secrets set")
  );
  const secretRun = String(secretStep?.run ?? "");
  if (
    secretStep?.env?.PRODUCTION_SUPABASE_SECRET_KEY !==
      "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}" ||
    !secretRun.includes("FRCQ_SUPABASE_SECRET_KEY=$PRODUCTION_SUPABASE_SECRET_KEY") ||
    !secretRun.includes(
      "FRCQ_SUPABASE_PUBLISHABLE_KEY=$PRODUCTION_SUPABASE_PUBLISHABLE_KEY",
    )
  ) {
    fail("repair requires the protected modern secret and publishable key");
  }

  const mutationSteps = steps.filter((step) =>
    /supabase\s+(?:secrets\s+set|functions\s+deploy)/.test(String(step?.run ?? ""))
  );
  if (
    mutationSteps.length !== 2 ||
    mutationSteps.some((step) => Object.prototype.hasOwnProperty.call(step, "if"))
  ) {
    fail("repair must contain only fail-closed secret and Function mutations");
  }
  const secretIndex = steps.indexOf(secretStep);
  const deployIndex = steps.findIndex((step) =>
    String(step?.run ?? "").includes("supabase functions deploy")
  );
  const readinessIndex = steps.findIndex((step) =>
    String(step?.run ?? "").includes("production-preflight.mjs --backend-only")
  );
  if (!(secretIndex >= 0 && secretIndex < deployIndex && deployIndex < readinessIndex)) {
    fail("repair mutation and readiness order");
  }
}
