import { createClient } from "@supabase/supabase-js";
import {
  evaluateReadinessReport,
  probeEdgeFunctions,
  readPreflightConfiguration,
} from "./production-preflight-core.mjs";

const configuration = readPreflightConfiguration(process.env, {
  backendOnly: process.argv.includes("--backend-only"),
});

const health = await fetch(`${configuration.url}/auth/v1/health`, {
  headers: { apikey: configuration.publishableKey },
});
if (!health.ok) {
  throw new Error(`Production Supabase health check failed: ${health.status}`);
}

const client = createClient(configuration.url, configuration.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const report = await client.rpc("get_production_readiness_report", {
  p_content_version_key: configuration.contentVersion ?? "__backend_only__",
  p_smoke_teacher_id:
    configuration.teacherId ?? "00000000-0000-0000-0000-000000000000",
  p_smoke_cohort_id:
    configuration.cohortId ?? "00000000-0000-0000-0000-000000000000",
});
if (report.error) {
  throw new Error(`Production readiness RPC failed: ${report.error.code}`);
}

const evidence = evaluateReadinessReport(report.data, configuration);
const edgeEvidence = await probeEdgeFunctions(configuration);
process.stdout.write(
  `${JSON.stringify({
    projectRef: configuration.projectRef,
    ...evidence,
    ...edgeEvidence,
  }, null, 2)}\n`,
);
