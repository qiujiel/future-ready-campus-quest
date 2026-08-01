const DEDICATED_LOAD_PROJECT_REF = "vadyhuipwbtgbzpeisbn";
const REQUIRED_GATE_D_MIGRATION = "20260730021100";

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing production preflight setting: ${name}`);
  return value;
}

export function projectRefFromSupabaseUrl(value) {
  const url = new URL(value);
  const suffix = ".supabase.co";
  if (url.protocol !== "https:" || !url.hostname.endsWith(suffix)) {
    throw new Error("Production URL must use a secure Supabase project hostname.");
  }
  const projectRef = url.hostname.slice(0, -suffix.length);
  if (
    !projectRef ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Production URL must identify one Supabase project root.");
  }
  return projectRef;
}

function readFrontendOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== value.replace(/\/$/, "") ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("PRODUCTION_FRONTEND_ORIGIN must be an HTTPS origin.");
  }
  return url.origin;
}

export function readPreflightConfiguration(
  environment,
  { backendOnly = false } = {},
) {
  const url = required(environment, "PRODUCTION_SUPABASE_URL");
  const projectRef = required(
    environment,
    "PRODUCTION_SUPABASE_PROJECT_REF",
  );
  const loadProjectRef = required(environment, "LOAD_SUPABASE_PROJECT_REF");
  const actualProjectRef = projectRefFromSupabaseUrl(url);
  if (actualProjectRef !== projectRef) {
    throw new Error("Production URL does not match the confirmed project ref.");
  }
  if (
    projectRef === loadProjectRef ||
    projectRef === DEDICATED_LOAD_PROJECT_REF
  ) {
    throw new Error("The dedicated load-test project cannot be production.");
  }
  const basePath = required(environment, "VITE_BASE_PATH");
  if (!basePath.startsWith("/") || !basePath.endsWith("/")) {
    throw new Error("VITE_BASE_PATH must start and end with a slash.");
  }

  const configuration = {
    backendOnly,
    url,
    projectRef,
    loadProjectRef,
    publishableKey: required(
      environment,
      "PRODUCTION_SUPABASE_PUBLISHABLE_KEY",
    ),
    readinessSecret: required(environment, "PRODUCTION_READINESS_SECRET"),
    frontendOrigin: readFrontendOrigin(
      required(environment, "PRODUCTION_FRONTEND_ORIGIN"),
    ),
    basePath,
  };

  if (backendOnly) {
    return {
      ...configuration,
      contentVersion: null,
      teacherId: null,
      cohortId: null,
    };
  }
  return {
    ...configuration,
    contentVersion: required(environment, "PRODUCTION_CONTENT_VERSION"),
    teacherId: required(environment, "PRODUCTION_SMOKE_TEACHER_ID"),
    cohortId: required(environment, "PRODUCTION_SMOKE_COHORT_ID"),
  };
}

export function evaluateReadinessReport(report, configuration) {
  const failures = [];
  if (
    report?.requiredMigrationsPresent !== true ||
    report?.latestGateDMigration !== REQUIRED_GATE_D_MIGRATION
  ) {
    failures.push("required Gate D migrations are missing");
  }
  if (report?.requiredFunctionsPresent !== true) {
    failures.push("required Gate D functions are missing");
  }
  if (report?.cleanupScheduleReady !== true) {
    failures.push("required cleanup schedule is missing or altered");
  }
  if (Number(report?.edgeFunctionsReady) !== 10) {
    failures.push("required Edge Function boundaries are not ready");
  }

  if (!configuration.backendOnly) {
    if (Number(report?.openJoinWindows) !== 0) {
      failures.push("an open join window remains");
    }
    if (Number(report?.openRecoveryTokens) !== 0) {
      failures.push("an open recovery token remains");
    }
    if (
      report?.contentVersion?.versionKey !== configuration.contentVersion ||
      Number(report?.contentVersion?.itemCount) !== 24 ||
      Number(report?.contentVersion?.conceptCount) !== 8
    ) {
      failures.push("protected content version/count is not ready");
    }
    if (report?.smokeFixtureReady !== true) {
      failures.push("teacher/cohort smoke fixture is not ready");
    }
    if (!Number.isInteger(report?.retentionDays) || report.retentionDays < 1) {
      failures.push("course-owner-approved retention is not configured");
    }
  }

  if (failures.length) {
    throw new Error(`Production preflight failed: ${failures.join("; ")}`);
  }

  const evidence = {
    latestGateDMigration: REQUIRED_GATE_D_MIGRATION,
    cleanupScheduleReady: true,
    edgeFunctionsReady: 10,
  };
  if (!configuration.backendOnly) {
    evidence.contentVersion = report.contentVersion;
    evidence.smokeFixtureReady = true;
    evidence.retentionDays = report.retentionDays;
  }
  evidence.basePath = configuration.basePath;
  return evidence;
}

export async function fetchReadinessReport(configuration, fetcher = fetch) {
  const response = await fetcher(
    `${configuration.url}/functions/v1/production-readiness`,
    {
      method: "POST",
      headers: {
        apikey: configuration.publishableKey,
        Origin: configuration.frontendOrigin,
        "Content-Type": "application/json",
        "x-production-readiness-key": configuration.readinessSecret,
      },
      body: JSON.stringify({
        contentVersion: configuration.contentVersion ?? "__backend_only__",
        teacherId:
          configuration.teacherId ?? "00000000-0000-0000-0000-000000000000",
        cohortId:
          configuration.cohortId ?? "00000000-0000-0000-0000-000000000000",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Production readiness endpoint failed: ${response.status}`);
  }
  return response.json();
}
