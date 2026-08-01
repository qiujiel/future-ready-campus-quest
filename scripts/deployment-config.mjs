import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";

const PINNED_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;

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
    !/response_code[\s\S]*405|405[\s\S]*response_code/.test(runs)
  ) {
    fail(`${label} Edge readiness must require the expected 405 response`);
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
  const packageJob = pages?.jobs?.package;
  const preflightJob = pages?.jobs?.preflight;
  const deployJob = pages?.jobs?.deploy;
  const rollbackPrepare = rollback?.jobs?.prepare;
  const rollbackDeploy = rollback?.jobs?.deploy;

  requireInputs(backend, ["expected_sha", "production_project_ref"]);
  requireEnvironment(backendJob, "production-backend");
  requireContentsReadOnly(backendJob, "backend release");
  requireRun(
    backendJob,
    /PRODUCTION_SUPABASE_PROJECT_REF[\s\S]*LOAD_SUPABASE_PROJECT_REF|LOAD_SUPABASE_PROJECT_REF[\s\S]*PRODUCTION_SUPABASE_PROJECT_REF/,
    "backend release lacks load project separation",
  );
  requireRun(
    backendJob,
    /vadyhuipwbtgbzpeisbn/,
    "backend release must deny the dedicated load project",
  );
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
