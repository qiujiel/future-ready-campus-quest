import {
  evaluateReadinessReport,
  fetchReadinessReport,
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

const report = await fetchReadinessReport(configuration);
const evidence = evaluateReadinessReport(report, configuration);
const edgeEvidence = await probeEdgeFunctions(configuration);
process.stdout.write(
  `${JSON.stringify({
    projectRef: configuration.projectRef,
    ...evidence,
    ...edgeEvidence,
  }, null, 2)}\n`,
);
