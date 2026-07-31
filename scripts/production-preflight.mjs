import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing production preflight setting: ${name}`);
  return value;
}

const url = required("PRODUCTION_SUPABASE_URL");
const publishableKey = required("PRODUCTION_SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = required("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY");
const contentVersion = required("PRODUCTION_CONTENT_VERSION");
const teacherId = required("PRODUCTION_SMOKE_TEACHER_ID");
const cohortId = required("PRODUCTION_SMOKE_COHORT_ID");
const basePath = required("VITE_BASE_PATH");

if (!basePath.startsWith("/") || !basePath.endsWith("/")) {
  throw new Error("VITE_BASE_PATH must start and end with a slash.");
}

const health = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: publishableKey },
});
if (!health.ok) {
  throw new Error(`Production Supabase health check failed: ${health.status}`);
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const report = await client.rpc("get_production_readiness_report", {
  p_content_version_key: contentVersion,
  p_smoke_teacher_id: teacherId,
  p_smoke_cohort_id: cohortId,
});
if (report.error) throw report.error;

const value = report.data;
const failures = [];
if (value?.migrationMarker !== "20260730020400") {
  failures.push("required Gate D migration marker is missing");
}
if (!value?.requiredFunctionsPresent) {
  failures.push("required Gate D functions are missing");
}
if (Number(value?.openJoinWindows) !== 0) {
  failures.push("an open join window remains");
}
if (Number(value?.openRecoveryTokens) !== 0) {
  failures.push("an open recovery token remains");
}
if (
  value?.contentVersion?.versionKey !== contentVersion ||
  Number(value?.contentVersion?.itemCount) !== 24 ||
  Number(value?.contentVersion?.conceptCount) !== 8
) {
  failures.push("protected content version/count is not ready");
}
if (!value?.smokeFixtureReady) {
  failures.push("teacher/cohort smoke fixture is not ready");
}
if (!Number.isInteger(value?.retentionDays) || value.retentionDays < 1) {
  failures.push("course-owner-approved retention is not configured");
}
if (failures.length) {
  throw new Error(`Production preflight failed: ${failures.join("; ")}`);
}

process.stdout.write(
  `${JSON.stringify({
    migrationMarker: value.migrationMarker,
    contentVersion: value.contentVersion,
    smokeFixtureReady: value.smokeFixtureReady,
    retentionDays: value.retentionDays,
    basePath,
  }, null, 2)}\n`,
);
